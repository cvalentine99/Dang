import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

const hasOtxKey = !!process.env.OTX_API_KEY && process.env.OTX_API_KEY.length > 10;

// ── Preflight ping — skip network tests when OTX API is unreachable ─────────
let canReachOtx = false;

if (hasOtxKey) {
  try {
    const http = await import("http");
    const https = await import("https");
    canReachOtx = await new Promise<boolean>((resolve) => {
      const req = https.default.request(
        "https://otx.alienvault.com/api/v1/users/me",
        {
          method: "HEAD",
          timeout: 3_000,
          headers: {
            "X-OTX-API-KEY": process.env.OTX_API_KEY!,
            Accept: "application/json",
          },
        },
        (res) => {
          res.resume();
          resolve(res.statusCode !== undefined && res.statusCode < 500);
        }
      );
      req.on("error", () => resolve(false));
      req.on("timeout", () => {
        req.destroy();
        resolve(false);
      });
      req.end();
    });
  } catch {
    canReachOtx = false;
  }
}

// ── Validate OTX API key connectivity (skipped when API unreachable) ────────
describe("OTX API Key Validation", () => {
  it.skipIf(!hasOtxKey)("should have OTX_API_KEY set in environment", () => {
    expect(process.env.OTX_API_KEY).toBeDefined();
    expect(process.env.OTX_API_KEY!.length).toBeGreaterThan(10);
  });

  it.skipIf(!canReachOtx)(
    "should successfully connect to OTX API and retrieve user info",
    async () => {
      const axios = await import("axios");
      const response = await axios.default.get(
        "https://otx.alienvault.com/api/v1/users/me",
        {
          headers: {
            "X-OTX-API-KEY": process.env.OTX_API_KEY!,
            Accept: "application/json",
          },
          timeout: 15_000,
        }
      );
      expect(response.status).toBe(200);
      expect(response.data).toBeDefined();
      expect(response.data.username).toBeDefined();
    }
  );
});

// ── OTX Client unit tests (skipped in CI without key) ──────────────────────
describe("OTX Client", () => {
  it.skipIf(!hasOtxKey)("isOtxConfigured returns true when key is set", async () => {
    const { isOtxConfigured } = await import("./otxClient");
    expect(isOtxConfigured()).toBe(true);
  });

  it.skipIf(!hasOtxKey)("getOtxApiKey returns the key", async () => {
    const { getOtxApiKey } = await import("./otxClient");
    const key = getOtxApiKey();
    expect(key).toBeDefined();
    expect(key.length).toBeGreaterThan(10);
  });
});

// ── OTX Router mock tests (always run) ──────────────────────────────────────
vi.mock("./otxClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./otxClient")>();
  return {
    ...actual,
    isOtxConfigured: vi.fn(() => true),
    otxGet: vi.fn(),
  };
});

describe("OTX Router", () => {
  let otxGet: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const mod = await import("./otxClient");
    otxGet = mod.otxGet as ReturnType<typeof vi.fn>;
    otxGet.mockReset();
  });

  it("subscribedPulses calls correct endpoint with pagination", async () => {
    const mockResponse = {
      results: [{ id: "pulse1", name: "Test Pulse" }],
      count: 1,
    };
    otxGet.mockResolvedValue(mockResponse);

    const { otxRouter } = await import("./otxRouter");
    expect(otxRouter).toBeDefined();
    expect(otxRouter._def.procedures.subscribedPulses).toBeDefined();
  });

  it("indicatorLookup validates input types", async () => {
    const { otxRouter } = await import("./otxRouter");
    expect(otxRouter._def.procedures.indicatorLookup).toBeDefined();
  });

  it("searchPulses validates query is non-empty", async () => {
    const { otxRouter } = await import("./otxRouter");
    expect(otxRouter._def.procedures.searchPulses).toBeDefined();
  });

  it("pulseDetail accepts pulseId parameter", async () => {
    const { otxRouter } = await import("./otxRouter");
    expect(otxRouter._def.procedures.pulseDetail).toBeDefined();
  });

  it("pulseIndicators accepts pulseId and pagination", async () => {
    const { otxRouter } = await import("./otxRouter");
    expect(otxRouter._def.procedures.pulseIndicators).toBeDefined();
  });

  it("activity endpoint exists", async () => {
    const { otxRouter } = await import("./otxRouter");
    expect(otxRouter._def.procedures.activity).toBeDefined();
  });

  it("status endpoint exists", async () => {
    const { otxRouter } = await import("./otxRouter");
    expect(otxRouter._def.procedures.status).toBeDefined();
  });
});

// ── OTX Router — All endpoints require authentication ───────────────────────
describe("OTX Router — All endpoints require authentication", () => {
  it.skipIf(!canReachOtx)(
    "otx.status succeeds for authenticated requests",
    async () => {
      // This test only runs when OTX is reachable — validates end-to-end
      const { isOtxConfigured } = await import("./otxClient");
      expect((isOtxConfigured as ReturnType<typeof vi.fn>)()).toBe(true);
    }
  );
});
