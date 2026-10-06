import { hash, type Options, verify } from "@node-rs/argon2";

/** OWASP's Argon2id baseline: 19 MiB, 2 iterations, 1 lane. */
const options: Options = {
  // `Algorithm.Argon2id`; the enum is a const enum, unreadable under isolatedModules.
  algorithm: 2,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

export function hashPassword(password: string) {
  return hash(password, options);
}

/**
 * Verified against when no user matches, so an unknown email costs the same
 * time as a wrong password. Generated once per process from random input.
 */
let dummyHash: Promise<string> | undefined;

export async function verifyPassword(
  passwordHash: string | null,
  password: string,
) {
  if (passwordHash === null) {
    dummyHash ??= hash(crypto.randomUUID(), options);
    await verify(await dummyHash, password);
    return false;
  }
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}
