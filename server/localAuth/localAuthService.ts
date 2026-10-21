import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { users } from "../../drizzle/schema";
import { getDb } from "../db";
import { sdk } from "../_core/sdk";
import { randomUUID } from "crypto";

const SALT_ROUNDS = 12;

/**
 * Auth mode is always local (JWT + bcrypt). No OAuth.
 */
export function isLocalAuthMode(): boolean {
  return true;
}

/**
 * Hash a plaintext password with bcrypt.
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Verify a plaintext password against a bcrypt hash.
 */
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export type LocalRole = "admin" | "user";

/** M1: the single message for every login failure (no user enumeration). */
export const INVALID_CREDENTIALS_MSG = "Invalid username or password";

/** Used to equalize bcrypt timing when there is no real hash to compare against. */
const DUMMY_HASH = "$2a$12$LJ3m4ys3Lg2VBe8sFNNmXOYDBGOLBmSKnGJeK1AOyCbHbDSqnGacy";

type MysqlErrorLike = { code?: string; errno?: number; sqlMessage?: string; message?: string };

/** Find the mysql2 error in a (possibly Drizzle-wrapped) error's cause chain. */
function findMysqlError(err: unknown): MysqlErrorLike | undefined {
  let cur: unknown = err;
  for (let i = 0; i < 5 && cur && typeof cur === "object"; i++) {
    const e = cur as MysqlErrorLike & { cause?: unknown };
    if (typeof e.code === "string" || typeof e.errno === "number") return e;
    cur = e.cause;
  }
  return undefined;
}

/**
 * C3: Map MySQL constraint/lock errors from registration to friendly TRPCErrors.
 * ER_DUP_ENTRY (1062) on users_name_uniq / users_email_uniq is the authoritative
 * duplicate check (the pre-SELECTs below are only for a nicer message);
 * ER_LOCK_DEADLOCK (1213) is how InnoDB resolves two concurrent first-user
 * registrations contending on the FOR UPDATE gap lock — the loser retries.
 */
function mapRegistrationDbError(err: unknown): unknown {
  if (err instanceof TRPCError) return err;
  const my = findMysqlError(err);
  if (!my) return err;
  if (my.code === "ER_DUP_ENTRY" || my.errno === 1062) {
    const text = `${my.sqlMessage ?? ""} ${my.message ?? ""}`;
    const message = text.includes("users_email_uniq")
      ? "Email already registered"
      : text.includes("users_name_uniq")
        ? "Username already exists"
        : "An account with that username or email already exists";
    return new TRPCError({ code: "CONFLICT", message, cause: err });
  }
  if (my.code === "ER_LOCK_DEADLOCK" || my.errno === 1213) {
    return new TRPCError({
      code: "CONFLICT",
      message: "Registration conflicted with a concurrent request. Please try again.",
      cause: err,
    });
  }
  return err;
}

/**
 * Register a new local user.
 *
 * Role: `input.role` if given (admin seeding); otherwise the first user becomes
 * admin and everyone after is "user".
 *
 * Gate: unless `allowWhenUsersExist` is true, registration is refused when any
 * user already exists. The check is made under the same locking read that
 * decides first-user-admin, so the router's cheap pre-check cannot be raced.
 *
 * C3: The first-user check is `SELECT … LIMIT 1 FOR UPDATE` inside the
 * transaction. On an empty InnoDB table under REPEATABLE READ (MySQL default)
 * this takes a next-key lock on the supremum, so concurrent registrations either
 * serialize behind it or one dies with ER_LOCK_DEADLOCK — never two admins.
 * UNIQUE(name)/UNIQUE(email) back this up for duplicate accounts.
 */
export async function registerLocalUser(input: {
  username: string;
  email?: string;
  password: string;
  role?: LocalRole;
  allowWhenUsersExist?: boolean;
}): Promise<{ id: number; openId: string; name: string; role: LocalRole; tokenVersion: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Pre-compute expensive hash outside the transaction to minimize lock time
  const passwordHash = await hashPassword(input.password);
  const openId = `local_${randomUUID().replace(/-/g, "")}`;

  try {
    return await db.transaction(async (tx) => {
      // C3: locking read — see doc comment
      const existingUsers = await tx
        .select({ id: users.id })
        .from(users)
        .limit(1)
        .for("update");
      const isFirstUser = existingUsers.length === 0;

      if (!isFirstUser && !input.allowWhenUsersExist) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Registration is closed. Contact an administrator for an account.",
        });
      }

      const role: LocalRole = input.role ?? (isFirstUser ? "admin" : "user");

      // Friendly pre-checks; the UNIQUE indexes are authoritative (ER_DUP_ENTRY below)
      const existing = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.name, input.username))
        .limit(1);
      if (existing.length > 0) {
        throw new TRPCError({ code: "CONFLICT", message: "Username already exists" });
      }

      if (input.email) {
        const existingEmail = await tx
          .select({ id: users.id })
          .from(users)
          .where(eq(users.email, input.email))
          .limit(1);
        if (existingEmail.length > 0) {
          throw new TRPCError({ code: "CONFLICT", message: "Email already registered" });
        }
      }

      const [result] = await tx.insert(users).values({
        openId,
        name: input.username,
        email: input.email || null,
        passwordHash,
        loginMethod: "local",
        role,
        lastSignedIn: new Date(),
      }).$returningId();

      return {
        id: result.id, // Audit #18: return actual auto-increment PK
        openId,
        name: input.username,
        role,
        tokenVersion: 0,
      };
    });
  } catch (err) {
    throw mapRegistrationDbError(err);
  }
}

/**
 * Mint a session JWT bound to the user's current tokenVersion.
 */
export async function issueSessionToken(user: {
  openId: string;
  name: string | null;
  tokenVersion: number;
}): Promise<string> {
  return sdk.signSession({
    openId: user.openId,
    // NOTE: VITE_APP_ID is a platform-injected env var available to both client and server.
    // Despite the VITE_ prefix, it is intentionally used server-side here for JWT session signing
    // to match the app identity expected by the OAuth SDK.
    appId: process.env.VITE_APP_ID || "dang-local",
    name: user.name || "",
    tv: user.tokenVersion,
  });
}

/**
 * Authenticate a local user by username/email + password.
 * Returns a signed JWT session token on success.
 *
 * M1: every failure (unknown user, disabled, no password, wrong password) throws
 * the same UNAUTHORIZED / INVALID_CREDENTIALS_MSG after one bcrypt compare.
 */
export async function loginLocalUser(input: {
  username: string;
  password: string;
}): Promise<{
  token: string;
  user: { id: number; openId: string; name: string; role: string };
}> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const invalid = () =>
    new TRPCError({ code: "UNAUTHORIZED", message: INVALID_CREDENTIALS_MSG });

  // Look up user by name, then email. Both columns are UNIQUE, and usernames
  // cannot contain "@", so each lookup matches at most one row; .limit(1) is
  // kept as a belt-and-braces bound.
  let userRows = await db
    .select()
    .from(users)
    .where(eq(users.name, input.username))
    .limit(1);

  if (userRows.length === 0) {
    userRows = await db
      .select()
      .from(users)
      .where(eq(users.email, input.username))
      .limit(1);
  }

  // Constant-time-ish: always run exactly one bcrypt compare
  if (userRows.length === 0) {
    await verifyPassword(input.password, DUMMY_HASH);
    throw invalid();
  }

  const user = userRows[0];

  if (user.isDisabled || !user.passwordHash) {
    await verifyPassword(input.password, user.passwordHash ?? DUMMY_HASH);
    throw invalid();
  }

  const isValid = await verifyPassword(input.password, user.passwordHash);
  if (!isValid) {
    throw invalid();
  }

  // Update last signed in
  await db
    .update(users)
    .set({ lastSignedIn: new Date() })
    .where(eq(users.id, user.id));

  const token = await issueSessionToken(user);

  return {
    token,
    user: {
      id: user.id,
      openId: user.openId,
      name: user.name || "",
      role: user.role,
    },
  };
}

/**
 * Seed the admin user from LOCAL_ADMIN_USER / LOCAL_ADMIN_PASS.
 * Called on server startup in local auth mode.
 *
 * H-A9: always creates the account with an explicit role "admin" (previously it
 * delegated to the first-user rule and created a plain "user" on any populated
 * DB while logging "Seeded admin user"). If the configured name already exists
 * as role "user", it is promoted — but only when LOCAL_ADMIN_PASS verifies
 * against that account's hash, so a same-named account registered by someone
 * else (e.g. via open registration) is never escalated.
 */
export async function seedAdminUser(): Promise<void> {
  if (!isLocalAuthMode()) return;

  const adminUser = process.env.LOCAL_ADMIN_USER;
  const adminPass = process.env.LOCAL_ADMIN_PASS;

  if (!adminUser || !adminPass) {
    console.log(
      "[LocalAuth] No LOCAL_ADMIN_USER/LOCAL_ADMIN_PASS set. First registered user will become admin."
    );
    return;
  }

  const db = await getDb();
  if (!db) return;

  const existing = await db
    .select({ id: users.id, role: users.role, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.name, adminUser))
    .limit(1);

  if (existing.length > 0) {
    const row = existing[0];
    if (row.role === "admin") {
      console.log(`[LocalAuth] Admin user "${adminUser}" already exists (role=admin).`);
      return;
    }
    const passwordMatches =
      !!row.passwordHash && (await verifyPassword(adminPass, row.passwordHash));
    if (!passwordMatches) {
      console.error(
        `[LocalAuth] LOCAL_ADMIN_USER "${adminUser}" exists with role "${row.role}" but ` +
        `LOCAL_ADMIN_PASS does not match its password — NOT promoting to admin. ` +
        `Promote it from an existing admin account, or change LOCAL_ADMIN_USER.`
      );
      return;
    }
    await db
      .update(users)
      .set({ role: "admin", tokenVersion: sql`${users.tokenVersion} + 1` })
      .where(eq(users.id, row.id));
    console.warn(
      `[LocalAuth] PROMOTED existing user "${adminUser}" (id=${row.id}) from role "${row.role}" ` +
      `to "admin" because it matches LOCAL_ADMIN_USER/LOCAL_ADMIN_PASS.`
    );
    return;
  }

  try {
    const created = await registerLocalUser({
      username: adminUser,
      password: adminPass,
      role: "admin",
      allowWhenUsersExist: true,
    });
    if (created.role === "admin") {
      console.log(
        `[LocalAuth] Seeded admin user "${adminUser}" from environment variables.`
      );
    } else {
      console.error(
        `[LocalAuth] Seeding "${adminUser}" produced role "${created.role}", not admin.`
      );
    }
  } catch (error) {
    console.error("[LocalAuth] Failed to seed admin user:", error);
  }
}

/**
 * Get the count of registered users.
 */
export async function getUserCount(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  // C-3: Use SQL COUNT(*) instead of fetching all rows
  const { count } = await import("drizzle-orm");
  const [result] = await db.select({ count: count() }).from(users);
  return result?.count ?? 0;
}
