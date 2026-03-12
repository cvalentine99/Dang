import { describe, it, expect } from "vitest";
import { isValidEntityValue } from "./correlationAgent";

describe("BUG-5: OTX path injection prevention", () => {
  it("rejects path traversal in IP values", () => {
    expect(isValidEntityValue("ip", "../../../etc/passwd")).toBe(false);
    expect(isValidEntityValue("ip", "192.168.1.1/../admin")).toBe(false);
  });

  it("rejects slashes in hash values", () => {
    expect(isValidEntityValue("hash", "abc/def")).toBe(false);
    expect(isValidEntityValue("hash", "abc/../def")).toBe(false);
    expect(isValidEntityValue("hash", "abcdef0123456789/payload")).toBe(false);
  });

  it("rejects path traversal in domain values", () => {
    expect(isValidEntityValue("domain", "../../admin")).toBe(false);
    expect(isValidEntityValue("domain", "evil.com/../secret")).toBe(false);
    expect(isValidEntityValue("domain", "evil.com/path")).toBe(false);
  });

  it("accepts valid IPv4", () => {
    expect(isValidEntityValue("ip", "192.168.1.1")).toBe(true);
    expect(isValidEntityValue("ip", "10.0.0.1")).toBe(true);
    expect(isValidEntityValue("ip", "255.255.255.255")).toBe(true);
  });

  it("accepts valid IPv6", () => {
    expect(isValidEntityValue("ip", "2001:db8::1")).toBe(true);
    expect(isValidEntityValue("ip", "fe80::1")).toBe(true);
    expect(isValidEntityValue("ip", "::1")).toBe(true);
  });

  it("accepts valid SHA256 hash", () => {
    const sha256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    expect(isValidEntityValue("hash", sha256)).toBe(true);
  });

  it("accepts valid MD5 hash", () => {
    const md5 = "d41d8cd98f00b204e9800998ecf8427e";
    expect(isValidEntityValue("hash", md5)).toBe(true);
  });

  it("accepts valid SHA1 hash", () => {
    const sha1 = "da39a3ee5e6b4b0d3255bfef95601890afd80709";
    expect(isValidEntityValue("hash", sha1)).toBe(true);
  });

  it("accepts valid domain", () => {
    expect(isValidEntityValue("domain", "evil.example.com")).toBe(true);
    expect(isValidEntityValue("domain", "sub.domain.co.uk")).toBe(true);
    expect(isValidEntityValue("domain", "my-host.internal")).toBe(true);
  });

  it("rejects empty values", () => {
    expect(isValidEntityValue("ip", "")).toBe(false);
    expect(isValidEntityValue("hash", "")).toBe(false);
    expect(isValidEntityValue("domain", "")).toBe(false);
  });

  it("rejects extremely long values", () => {
    const longIp = "1".repeat(257);
    const longHash = "a".repeat(257);
    const longDomain = "a".repeat(257);
    expect(isValidEntityValue("ip", longIp)).toBe(false);
    expect(isValidEntityValue("hash", longHash)).toBe(false);
    expect(isValidEntityValue("domain", longDomain)).toBe(false);
  });

  it("rejects unknown entity types", () => {
    expect(isValidEntityValue("unknown", "anything")).toBe(false);
    expect(isValidEntityValue("", "anything")).toBe(false);
  });

  it("rejects URL-encoded path traversal in IP values", () => {
    expect(isValidEntityValue("ip", "%2e%2e%2f")).toBe(false);
  });

  it("rejects special characters in hash values", () => {
    expect(isValidEntityValue("hash", "abc;def")).toBe(false);
    expect(isValidEntityValue("hash", "abc&def")).toBe(false);
    expect(isValidEntityValue("hash", "abc def")).toBe(false);
  });

  it("rejects special characters in domain values", () => {
    expect(isValidEntityValue("domain", "evil.com;rm -rf")).toBe(false);
    expect(isValidEntityValue("domain", "evil.com&payload")).toBe(false);
  });
});
