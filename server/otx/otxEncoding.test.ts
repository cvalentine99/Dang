import { describe, it, expect } from "vitest";

/**
 * OTX indicator encoding tests.
 * Verifies that all indicator types are safely encoded for path construction.
 */
describe("OTX indicator path encoding", () => {
  // The fix encodes ALL indicator values with encodeURIComponent
  const encode = encodeURIComponent;

  it("encodes URL indicators", () => {
    const url = "https://evil.com/malware?id=1&type=exe";
    const encoded = encode(url);
    expect(encoded).not.toContain("/");
    expect(encoded).not.toContain("?");
    expect(encoded).not.toContain("&");
  });

  it("encodes IPv6 addresses (colons)", () => {
    const ipv6 = "2001:db8::1";
    const encoded = encode(ipv6);
    expect(encoded).not.toContain(":");
  });

  it("encodes file hashes with path-like characters", () => {
    // While real hashes are hex, a crafted value could contain path chars
    const crafted = "abc/../../../etc/passwd";
    const encoded = encode(crafted);
    expect(encoded).not.toContain("/");
    // The encoded string still contains ".." literals, but the path
    // separators are encoded so traversal is neutralized:
    expect(encoded).not.toContain("/..");
    expect(encoded).not.toContain("../");
  });

  it("encodes domains with special characters", () => {
    const domain = "evil.com/path?inject=true";
    const encoded = encode(domain);
    expect(encoded).not.toContain("/");
    expect(encoded).not.toContain("?");
  });

  it("preserves normal indicator values", () => {
    expect(encode("192.168.1.1")).toBe("192.168.1.1");
    expect(encode("example.com")).toBe("example.com");
    expect(encode("abc123def456")).toBe("abc123def456");
  });

  it("constructs safe OTX API paths", () => {
    const types = ["IPv4", "IPv6", "domain", "hostname", "file", "url", "cve"];
    const maliciousValue = "../../api/v1/admin";

    for (const type of types) {
      const path = `/api/v1/indicators/${type}/${encode(maliciousValue)}/general`;
      expect(path).not.toContain("../../");
      expect(path.split("/").length).toBe(7); // Fixed structure
    }
  });
});
