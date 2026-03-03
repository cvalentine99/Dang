import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
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

/**
 * Register a new local user. The first user registered becomes admin.
 * Returns the created user or throws if username/email already exists.
 */
export async function registerLocalUser(input: {
  username: string;
  email?: string;
  password: string;
}): Promise<{ id: number; openId: string; name: string; role: string }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Check if any users exist — first user becomes admin
  const existingUsers = await db.select({ id: users.id }).from(users).limit(1);
  const isFirstUser = existingUsers.length === 0;

  // Generate a unique openId for local users
  const openId = `local_${randomUUID().replace(/-/g, "")}`;
  const passwordHash = await hashPassword(input.password);

  // Check if username already exists
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.name, input.username))
    .limit(1);

  if (existing.length > 0) {
    throw new Error("Username already exists");
  }

  // Check if email already exists (if provided)
  if (input.email) {
    const existingEmail = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, input.email))
      .limit(1);
    if (existingEmail.length > 0) {
      throw new Error("Email already registered");
    }
  }

  await db.insert(users).values({
    openId,
    name: input.username,
    email: input.email || null,
    passwordHash,
    loginMethod: "local",
    role: isFirstUser ? "admin" : "user",
    lastSignedIn: new Date(),
  });

  return {
    id: 0, // Will be set by auto-increment
    openId,
    name: input.username,
    role: isFirstUser ? "admin" : "user",
  };
}

/**
 * Authenticate a local user by username/email + password.
 * Returns a signed JWT session token on success.
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

  // Look up user by name or email
  let userRows = await db
    .select()
    .from(users)
    .where(eq(users.name, input.username))
    .limit(1);

  if (userRows.length === 0) {
    // Try email lookup
    userRows = await db
      .select()
      .from(users)
      .where(eq(users.email, input.username))
      .limit(1);
  }

  if (userRows.length === 0) {
    throw new Error("Invalid username or password");
  }

  const user = userRows[0];

  // Block disabled users
  if (user.isDisabled) {
    throw new Error("This account has been disabled. Contact an administrator.");
  }

  if (!user.passwordHash) {
    throw new Error(
      "This account does not have a password set. Contact an administrator."
    );
  }

  const isValid = await verifyPassword(input.password, user.passwordHash);
  if (!isValid) {
    throw new Error("Invalid username or password");
  }

  // Update last signed in
  await db
    .update(users)
    .set({ lastSignedIn: new Date() })
    .where(eq(users.id, user.id));

  // Create JWT session token using the existing SDK signing
  const token = await sdk.signSession({
    openId: user.openId,
    // NOTE: VITE_APP_ID is a platform-injected env var available to both client and server.
    // Despite the VITE_ prefix, it is intentionally used server-side here for JWT session signing
    // to match the app identity expected by the OAuth SDK.
    appId: process.env.VITE_APP_ID || "dang-local",
    name: user.name || "",
  });

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
 * Seed the default admin user from environment variables if no users exist.
 * Called on server startup in local auth mode.
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

  // Check if admin already exists
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.name, adminUser))
    .limit(1);

  if (existing.length > 0) {
    console.log(`[LocalAuth] Admin user "${adminUser}" already exists.`);
    return;
  }

  try {
    await registerLocalUser({
      username: adminUser,
      password: adminPass,
    });
    console.log(
      `[LocalAuth] Seeded admin user "${adminUser}" from environment variables.`
    );
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

  const result = await db.select({ id: users.id }).from(users);
  return result.length;
}
