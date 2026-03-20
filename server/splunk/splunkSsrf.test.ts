import { describe, it, expect } from "vitest";
import { validateSplunkHost } from "./splunkService";

/**
 * SSRF validation tests against the real production validateSplunkHost function.
 * These test the actual code path that guards testSplunkConnection.
 */
describe("Splunk SSRF protection (production function)", () => {
  // ── Blocked hosts ──────────────────────────────────────────────────────────

  it("blocks localhost", async () => {
    const result = await validateSplunkHost("localhost");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Blocked");
  });

  it("blocks cloud metadata IP 169.254.169.254", async () => {
    const result = await validateSplunkHost("169.254.169.254");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Blocked");
  });

  it("blocks loopback 127.0.0.1", async () => {
    const result = await validateSplunkHost("127.0.0.1");
    expect(result.allowed).toBe(false);
  });

  it("blocks loopback 127.0.0.2", async () => {
    const result = await validateSplunkHost("127.0.0.2");
    expect(result.allowed).toBe(false);
  });

  it("blocks 0.0.0.0", async () => {
    const result = await validateSplunkHost("0.0.0.0");
    expect(result.allowed).toBe(false);
  });

  it("blocks 255.255.255.255", async () => {
    const result = await validateSplunkHost("255.255.255.255");
    expect(result.allowed).toBe(false);
  });

  it("blocks metadata.google.internal", async () => {
    const result = await validateSplunkHost("metadata.google.internal");
    expect(result.allowed).toBe(false);
  });

  it("blocks instance-data", async () => {
    const result = await validateSplunkHost("instance-data");
    expect(result.allowed).toBe(false);
  });

  it("blocks empty host", async () => {
    const result = await validateSplunkHost("");
    expect(result.allowed).toBe(false);
  });

  it("blocks whitespace-only host", async () => {
    const result = await validateSplunkHost("   ");
    expect(result.allowed).toBe(false);
  });

  it("blocks subdomain of metadata.google.internal", async () => {
    const result = await validateSplunkHost("foo.metadata.google.internal");
    expect(result.allowed).toBe(false);
  });

  // ── Allowed hosts ──────────────────────────────────────────────────────────

  it("allows RFC 1918 192.168.x.x", async () => {
    const result = await validateSplunkHost("192.168.1.100");
    expect(result.allowed).toBe(true);
  });

  it("allows RFC 1918 10.x.x.x", async () => {
    const result = await validateSplunkHost("10.0.0.5");
    expect(result.allowed).toBe(true);
  });

  it("allows RFC 1918 172.16.x.x", async () => {
    const result = await validateSplunkHost("172.16.0.1");
    expect(result.allowed).toBe(true);
  });

  it("allows public IPs", async () => {
    const result = await validateSplunkHost("8.8.8.8");
    expect(result.allowed).toBe(true);
  });

  it("allows public IP 203.0.113.1", async () => {
    const result = await validateSplunkHost("203.0.113.1");
    expect(result.allowed).toBe(true);
  });
});
