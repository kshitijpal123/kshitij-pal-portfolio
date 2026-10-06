// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  generateToken,
  hashToken,
  isWellFormedToken,
  secretsMatch,
} from "@/lib/admin/tokens";

describe("tokens", () => {
  it("generates 256-bit base64url tokens that never repeat", () => {
    const tokens = Array.from({ length: 200 }, generateToken);
    for (const token of tokens) {
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(Buffer.from(token, "base64url")).toHaveLength(32);
      expect(isWellFormedToken(token)).toBe(true);
    }
    expect(new Set(tokens).size).toBe(tokens.length);
  });

  it("rejects malformed tokens", () => {
    for (const value of [
      "",
      "short",
      `${generateToken()}x`,
      "a".repeat(42) + "!",
    ]) {
      expect(isWellFormedToken(value)).toBe(false);
    }
  });

  it("hashes deterministically to SHA-256 hex that does not contain the token", () => {
    const token = generateToken();
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token)).not.toContain(token);
    expect(hashToken(token)).not.toBe(hashToken(generateToken()));
  });

  it("compares secrets of any length", () => {
    expect(secretsMatch("secret-value", "secret-value")).toBe(true);
    expect(secretsMatch("secret-value", "secret-valuf")).toBe(false);
    expect(secretsMatch("secret-value", "secret")).toBe(false);
    expect(secretsMatch("", "secret")).toBe(false);
  });
});
