import { describe, it, expect } from "vitest";
import { validateIPv4, validateHost } from "./hostValidation";

describe("Host Validation — SSRF Defense", () => {
  // ── IPv4 Validation ──────────────────────────────────────────────────────

  describe("validateIPv4", () => {
    it("allows RFC 1918 10.0.0.0/8 addresses", () => {
      expect(validateIPv4("10.0.0.1").allowed).toBe(true);
      expect(validateIPv4("10.255.255.255").allowed).toBe(true);
      expect(validateIPv4("10.100.50.25").allowed).toBe(true);
    });

    it("allows RFC 1918 172.16.0.0/12 addresses", () => {
      expect(validateIPv4("172.16.0.1").allowed).toBe(true);
      expect(validateIPv4("172.31.255.255").allowed).toBe(true);
      expect(validateIPv4("172.20.10.5").allowed).toBe(true);
    });

    it("allows RFC 1918 192.168.0.0/16 addresses", () => {
      expect(validateIPv4("192.168.0.1").allowed).toBe(true);
      expect(validateIPv4("192.168.50.158").allowed).toBe(true);
      expect(validateIPv4("192.168.255.255").allowed).toBe(true);
    });

    it("blocks loopback 127.0.0.0/8", () => {
      expect(validateIPv4("127.0.0.1").allowed).toBe(false);
      expect(validateIPv4("127.255.255.255").allowed).toBe(false);
      expect(validateIPv4("127.0.0.1").reason).toContain("loopback");
    });

    it("blocks cloud metadata 169.254.169.254", () => {
      expect(validateIPv4("169.254.169.254").allowed).toBe(false);
      expect(validateIPv4("169.254.0.1").allowed).toBe(false);
      expect(validateIPv4("169.254.169.254").reason).toContain("cloud metadata");
    });

    it("blocks 0.0.0.0/8 current network", () => {
      expect(validateIPv4("0.0.0.0").allowed).toBe(false);
      expect(validateIPv4("0.0.0.1").allowed).toBe(false);
    });

    it("blocks broadcast 255.255.255.255", () => {
      expect(validateIPv4("255.255.255.255").allowed).toBe(false);
    });

    it("blocks public internet IPs (not in RFC 1918)", () => {
      expect(validateIPv4("8.8.8.8").allowed).toBe(false);
      expect(validateIPv4("1.1.1.1").allowed).toBe(false);
      expect(validateIPv4("203.0.113.1").allowed).toBe(false);
      expect(validateIPv4("8.8.8.8").reason).toContain("not in any allowed RFC 1918 range");
    });

    it("blocks 172.32.0.0 (outside 172.16.0.0/12)", () => {
      expect(validateIPv4("172.32.0.1").allowed).toBe(false);
    });

    it("rejects invalid IPv4 strings", () => {
      expect(validateIPv4("not-an-ip").allowed).toBe(false);
      expect(validateIPv4("256.1.1.1").allowed).toBe(false);
      expect(validateIPv4("1.2.3").allowed).toBe(false);
      expect(validateIPv4("").allowed).toBe(false);
    });

    it("rejects octal-padded octets (anti-bypass)", () => {
      // "010.0.0.1" should fail because "010" !== "10"
      expect(validateIPv4("010.0.0.1").allowed).toBe(false);
    });
  });

  // ── Hostname Validation ──────────────────────────────────────────────────

  describe("validateHost", () => {
    it("blocks 'localhost'", async () => {
      const result = await validateHost("localhost");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Blocked hostname");
    });

    it("blocks 'metadata.google.internal'", async () => {
      const result = await validateHost("metadata.google.internal");
      expect(result.allowed).toBe(false);
    });

    it("blocks empty host", async () => {
      const result = await validateHost("");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("empty");
    });

    it("blocks IPv6 addresses", async () => {
      const result = await validateHost("::1");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("IPv6");
    });

    it("allows valid RFC 1918 IP passed as host", async () => {
      const result = await validateHost("192.168.50.158");
      expect(result.allowed).toBe(true);
    });

    it("blocks cloud metadata IP passed as host", async () => {
      const result = await validateHost("169.254.169.254");
      expect(result.allowed).toBe(false);
    });

    it("blocks public IP passed as host", async () => {
      const result = await validateHost("8.8.8.8");
      expect(result.allowed).toBe(false);
    });

    it("trims whitespace from host", async () => {
      const result = await validateHost("  192.168.1.1  ");
      expect(result.allowed).toBe(true);
    });
  });
});
