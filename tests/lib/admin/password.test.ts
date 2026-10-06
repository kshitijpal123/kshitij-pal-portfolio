// @vitest-environment node
import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/admin/password";

describe("password hashing", () => {
  it("hashes with Argon2id at the OWASP baseline and a random salt", async () => {
    const first = await hashPassword("a long passphrase");
    const second = await hashPassword("a long passphrase");

    expect(first).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(first).not.toContain("a long passphrase");
    expect(first).not.toBe(second);
  });

  it("verifies only the right password", async () => {
    const hash = await hashPassword("a long passphrase");
    expect(await verifyPassword(hash, "a long passphrase")).toBe(true);
    expect(await verifyPassword(hash, "a long passphrasf")).toBe(false);
    expect(await verifyPassword(hash, "")).toBe(false);
  });

  it("treats a malformed hash or a missing user as a failed match", async () => {
    expect(await verifyPassword("not-a-hash", "anything")).toBe(false);
    expect(await verifyPassword(null, "anything")).toBe(false);
  });
});
