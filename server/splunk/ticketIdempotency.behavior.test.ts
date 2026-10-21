/**
 * Splunk ticket creation idempotency (H-T3) — DB-gated.
 *
 * Calls appRouter.splunk.createTicket through createCaller against the
 * migrated test database, with only the network mocked: global `fetch` (the
 * undici-backed fetch splunkService.sendHECEvent uses) is stubbed to a 200 HEC
 * response. Creating a ticket for the same queue item twice must reach Splunk
 * once and leave exactly one ticket_artifacts row.
 */
import { afterAll, beforeAll, expect, it, vi } from "vitest";

// splunkService captures SPLUNK_* at module load; ENV captures JWT_SECRET.
vi.hoisted(() => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-that-is-long-enough-32chars";
  process.env.SPLUNK_HOST = "splunk.hec.test.invalid";
  process.env.SPLUNK_HEC_PORT = "8088";
  process.env.SPLUNK_HEC_TOKEN = "11111111-2222-3333-4444-555555555555";
});

import { eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { appRouter } from "../routers";
import { getDb, getUserByOpenId } from "../db";
import { alertQueue, ticketArtifacts, type User } from "../../drizzle/schema";
import { describeWithDb } from "../testHelpers/requireDb";
import { makeTrpcContext } from "../testHelpers/trpcContext";

const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
  new Response(JSON.stringify({ text: "Success", code: 0 }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
);

function hecPosts(): Array<{ url: string; body: { event?: { ticket_id?: string } } }> {
  return fetchMock.mock.calls
    .map(([url, init]) => ({ url: String(url), init }))
    .filter((c) => c.url.includes("/services/collector/event") && c.init?.method === "POST")
    .map((c) => ({ url: c.url, body: JSON.parse(String(c.init?.body ?? "{}")) }));
}

describeWithDb("splunk.createTicket is idempotent per queue item (real DB, mocked HEC)", () => {
  let admin: User;
  let queueItemId: number;

  beforeAll(async () => {
    vi.stubGlobal("fetch", fetchMock);
    admin = (await getUserByOpenId("test-fixture-admin"))!;
    const db = (await getDb())!;
    const [row] = await db
      .insert(alertQueue)
      .values({
        alertId: `ticket-idem-${randomBytes(6).toString("hex")}`,
        ruleId: "5710",
        ruleDescription: "sshd: Attempt to login using a non-existent user",
        ruleLevel: 10,
        agentId: "001",
        agentName: "web-01",
        alertTimestamp: "2026-10-21T12:00:00.000Z",
        status: "completed",
        triageResult: {
          answer: "Brute-force attempt from 203.0.113.9 against web-01; no successful logins.",
          reasoning: "Repeated invalid-user failures from a single source.",
          trustScore: 0.8,
          confidence: 0.7,
          safetyStatus: "clean",
        },
      })
      .$returningId();
    queueItemId = row.id;
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    const db = await getDb();
    if (!db || !queueItemId) return;
    await db.delete(ticketArtifacts).where(eq(ticketArtifacts.queueItemId, queueItemId));
    await db.delete(alertQueue).where(eq(alertQueue.id, queueItemId));
  });

  it("first call posts one HEC event and records one successful artifact", async () => {
    fetchMock.mockClear();
    const caller = appRouter.createCaller(makeTrpcContext({ user: admin }).ctx);
    const first = await caller.splunk.createTicket({ queueItemId });
    expect(first.success).toBe(true);
    expect(first.ticketId).toMatch(new RegExp(`^DANG-${queueItemId}-`));

    const posts = hecPosts();
    expect(posts).toHaveLength(1);
    expect(posts[0].url).toBe("https://splunk.hec.test.invalid:8088/services/collector/event");
    expect(posts[0].body.event?.ticket_id).toBe(first.ticketId);

    const db = (await getDb())!;
    const rows = await db.select().from(ticketArtifacts).where(eq(ticketArtifacts.queueItemId, queueItemId));
    expect(rows).toHaveLength(1);
    expect(rows[0].ticketId).toBe(first.ticketId);
    expect(Boolean(rows[0].success)).toBe(true);
  });

  // KNOWN BUG (found by this test, 2026-10-21): splunkRouter.createTicket has no
  // idempotency guard — the second call re-POSTs to HEC and inserts a second
  // ticket_artifacts row (batchCreateTickets pre-filters; createTicket does not).
  it("second call for the same queue item makes no HEC POST and adds no artifact row", async () => {
    fetchMock.mockClear();
    const caller = appRouter.createCaller(makeTrpcContext({ user: admin }).ctx);
    let second: { success: boolean; ticketId: string | null } | undefined;
    try {
      second = await caller.splunk.createTicket({ queueItemId });
    } catch (err) {
      // Refusing the duplicate (e.g. CONFLICT) is an acceptable contract too.
      expect(err).toBeInstanceOf(TRPCError);
    }

    expect(hecPosts()).toHaveLength(0);

    const db = (await getDb())!;
    const rows = await db.select().from(ticketArtifacts).where(eq(ticketArtifacts.queueItemId, queueItemId));
    expect(rows).toHaveLength(1);
    if (second?.success) expect(second.ticketId).toBe(rows[0].ticketId);
  });
});
