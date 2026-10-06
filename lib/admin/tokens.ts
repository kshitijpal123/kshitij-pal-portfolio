import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** 256 bits from the OS CSPRNG, base64url (43 characters). */
export function generateToken() {
  return randomBytes(32).toString("base64url");
}

const tokenPattern = /^[A-Za-z0-9_-]{43}$/;

export function isWellFormedToken(value: string) {
  return tokenPattern.test(value);
}

/**
 * Tokens are high-entropy random values, so a fast unsalted hash is enough to
 * make a leaked table useless without making lookups slow.
 */
export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** Constant-time comparison of two secrets of any length. */
export function secretsMatch(a: string, b: string) {
  return timingSafeEqual(
    createHash("sha256").update(a).digest(),
    createHash("sha256").update(b).digest(),
  );
}
