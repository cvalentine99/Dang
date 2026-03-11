import { describe, expect, it } from "vitest";
import { appRouter } from "../routers";
import type { TrpcContext } from "../_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAdminContext(overrides?: Partial<AuthenticatedUser>): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "admin-user-001",
    email: "admin@example.com",
    name: "Admin User",
    loginMethod: "local",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };

  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

function createUserContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 99,
    openId: "regular-user-099",
    email: "user@example.com",
    name: "Regular User",
    loginMethod: "local",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

function createUnauthContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

const HAS_DB = !!process.env.DATABASE_URL;

describe.skipIf(!HAS_DB)("adminUsers router", () => {
  describe("access control", () => {
    it("rejects unauthenticated users from listing users", async () => {
      const caller = appRouter.createCaller(createUnauthContext());
      await expect(caller.adminUsers.list()).rejects.toThrow();
    });

    it("rejects non-admin users from listing users", async () => {
      const caller = appRouter.createCaller(createUserContext());
      await expect(caller.adminUsers.list()).rejects.toThrow();
    });

    it("rejects unauthenticated users from updating roles", async () => {
      const caller = appRouter.createCaller(createUnauthContext());
      await expect(
        caller.adminUsers.updateRole({ userId: 2, role: "admin" })
      ).rejects.toThrow();
    });

    it("rejects non-admin users from updating roles", async () => {
      const caller = appRouter.createCaller(createUserContext());
      await expect(
        caller.adminUsers.updateRole({ userId: 2, role: "admin" })
      ).rejects.toThrow();
    });

    it("rejects unauthenticated users from resetting passwords", async () => {
      const caller = appRouter.createCaller(createUnauthContext());
      await expect(
        caller.adminUsers.resetPassword({ userId: 2, newPassword: "newpass123" })
      ).rejects.toThrow();
    });

    it("rejects non-admin users from resetting passwords", async () => {
      const caller = appRouter.createCaller(createUserContext());
      await expect(
        caller.adminUsers.resetPassword({ userId: 2, newPassword: "newpass123" })
      ).rejects.toThrow();
    });

    it("rejects unauthenticated users from toggling disabled status", async () => {
      const caller = appRouter.createCaller(createUnauthContext());
      await expect(
        caller.adminUsers.toggleDisabled({ userId: 2, isDisabled: true })
      ).rejects.toThrow();
    });

    it("rejects non-admin users from toggling disabled status", async () => {
      const caller = appRouter.createCaller(createUserContext());
      await expect(
        caller.adminUsers.toggleDisabled({ userId: 2, isDisabled: true })
      ).rejects.toThrow();
    });
  });

  describe("self-protection", () => {
    it("prevents admin from demoting themselves", async () => {
      const ctx = createAdminContext({ id: 5 });
      const caller = appRouter.createCaller(ctx);
      await expect(
        caller.adminUsers.updateRole({ userId: 5, role: "user" })
      ).rejects.toThrow(/cannot demote yourself/i);
    });

    it("prevents admin from disabling themselves", async () => {
      const ctx = createAdminContext({ id: 5 });
      const caller = appRouter.createCaller(ctx);
      await expect(
        caller.adminUsers.toggleDisabled({ userId: 5, isDisabled: true })
      ).rejects.toThrow(/cannot disable your own/i);
    });
  });

  describe("input validation", () => {
    it("rejects password shorter than 8 characters", async () => {
      const caller = appRouter.createCaller(createAdminContext());
      await expect(
        caller.adminUsers.resetPassword({ userId: 2, newPassword: "short" })
      ).rejects.toThrow();
    });

    it("rejects invalid role values", async () => {
      const caller = appRouter.createCaller(createAdminContext());
      await expect(
        // @ts-expect-error Testing invalid role
        caller.adminUsers.updateRole({ userId: 2, role: "superadmin" })
      ).rejects.toThrow();
    });

    it("rejects negative page numbers", async () => {
      const caller = appRouter.createCaller(createAdminContext());
      await expect(
        caller.adminUsers.list({ page: -1, pageSize: 50 })
      ).rejects.toThrow();
    });

    it("rejects page size over 100", async () => {
      const caller = appRouter.createCaller(createAdminContext());
      await expect(
        caller.adminUsers.list({ page: 1, pageSize: 200 })
      ).rejects.toThrow();
    });
  });

  describe("admin list query", () => {
    it("returns paginated user list for admin", async () => {
      const caller = appRouter.createCaller(createAdminContext());
      const result = await caller.adminUsers.list({ page: 1, pageSize: 50 });

      expect(result).toHaveProperty("users");
      expect(result).toHaveProperty("total");
      expect(result).toHaveProperty("page", 1);
      expect(result).toHaveProperty("pageSize", 50);
      expect(result).toHaveProperty("totalPages");
      expect(Array.isArray(result.users)).toBe(true);

      // Verify no passwordHash is leaked
      for (const user of result.users) {
        expect(user).not.toHaveProperty("passwordHash");
      }
    });

    it("supports search filtering", async () => {
      const caller = appRouter.createCaller(createAdminContext());
      // Search for a term that likely won't match anyone
      const result = await caller.adminUsers.list({
        page: 1,
        pageSize: 50,
        search: "zzz_nonexistent_user_zzz",
      });

      expect(result.users).toHaveLength(0);
    });
  });
});
