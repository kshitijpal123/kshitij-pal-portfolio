// @vitest-environment node
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { DecryptCommand, GenerateDataKeyCommand } from "@aws-sdk/client-kms";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createKmsTokenCipher,
  createLocalTokenCipher,
  type SecretContext,
} from "@/lib/admin/tokenCipher";

const secret = "1//refresh-token-SECRET-value";

const context: SecretContext = {
  purpose: "gmail-oauth-refresh-token",
  userId: "user-1",
  senderIdentityId: "identity-1",
};

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  delete (globalThis as { adminLocalTokenCipher?: unknown })
    .adminLocalTokenCipher;
});

type Command = { input: Record<string, unknown> };

/**
 * A stand-in for KMS: wraps data keys with its own key and refuses a
 * different encryption context, as KMS does.
 */
function fakeKms() {
  const master = randomBytes(32);
  const issued: Uint8Array[] = [];
  const send = vi.fn(async (command: Command) => {
    const encryptionContext = JSON.stringify(command.input.EncryptionContext);
    if (command instanceof GenerateDataKeyCommand) {
      const plaintext = new Uint8Array(randomBytes(32));
      issued.push(plaintext);
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", master, iv);
      cipher.setAAD(Buffer.from(encryptionContext));
      const body = Buffer.concat([cipher.update(plaintext), cipher.final()]);
      return {
        Plaintext: plaintext,
        CiphertextBlob: new Uint8Array(
          Buffer.concat([iv, cipher.getAuthTag(), body]),
        ),
      };
    }
    if (command instanceof DecryptCommand) {
      const blob = Buffer.from(command.input.CiphertextBlob as Uint8Array);
      const decipher = createDecipheriv(
        "aes-256-gcm",
        master,
        blob.subarray(0, 12),
      );
      decipher.setAAD(Buffer.from(encryptionContext));
      decipher.setAuthTag(blob.subarray(12, 28));
      try {
        return {
          Plaintext: new Uint8Array(
            Buffer.concat([
              decipher.update(blob.subarray(28)),
              decipher.final(),
            ]),
          ),
        };
      } catch {
        throw Object.assign(new Error("denied"), {
          name: "InvalidCiphertextException",
        });
      }
    }
    throw new Error("unexpected command");
  });
  return {
    client: { send: send as never },
    send,
    issued,
  };
}

describe("envelope encryption", () => {
  it("round-trips without the plaintext appearing in the stored value", async () => {
    const cipher = createLocalTokenCipher();
    const encrypted = await cipher.encrypt(secret, context);

    expect(encrypted).toMatchObject({ version: 1, scheme: "local" });
    expect(JSON.stringify(encrypted)).not.toContain(secret);
    expect(JSON.stringify(encrypted)).not.toContain(
      Buffer.from(secret).toString("base64"),
    );
    expect(await cipher.decrypt(encrypted, context)).toBe(secret);
  });

  it("uses a fresh data key and IV for every secret", async () => {
    const cipher = createLocalTokenCipher();
    const first = await cipher.encrypt(secret, context);
    const second = await cipher.encrypt(secret, context);
    expect(first.iv).not.toBe(second.iv);
    expect(first.encryptedDataKey).not.toBe(second.encryptedDataKey);
    expect(first.ciphertext).not.toBe(second.ciphertext);
  });

  it("refuses a different user or identity context", async () => {
    const cipher = createLocalTokenCipher();
    const encrypted = await cipher.encrypt(secret, context);
    await expect(
      cipher.decrypt(encrypted, { ...context, userId: "user-2" }),
    ).rejects.toThrow();
    await expect(
      cipher.decrypt(encrypted, { ...context, senderIdentityId: "other" }),
    ).rejects.toThrow();
  });

  it("detects tampering", async () => {
    const cipher = createLocalTokenCipher();
    const encrypted = await cipher.encrypt(secret, context);
    const flipped = Buffer.from(encrypted.ciphertext, "base64");
    flipped[0] ^= 1;
    await expect(
      cipher.decrypt(
        { ...encrypted, ciphertext: flipped.toString("base64") },
        context,
      ),
    ).rejects.toThrow();
  });

  it("refuses another scheme or process key", async () => {
    const encrypted = await createLocalTokenCipher().encrypt(secret, context);
    await expect(
      createLocalTokenCipher().decrypt(encrypted, context),
    ).rejects.toThrow();
    await expect(
      createKmsTokenCipher("key", fakeKms().client).decrypt(encrypted, context),
    ).rejects.toThrow("Unsupported credential format.");
  });
});

describe("KMS token cipher", () => {
  it("asks the configured key for an AES-256 data key with the context", async () => {
    const kms = fakeKms();
    const cipher = createKmsTokenCipher("arn:aws:kms:key/abc", kms.client);
    const encrypted = await cipher.encrypt(secret, context);

    expect(encrypted.scheme).toBe("kms");
    const [generate] = kms.send.mock.calls[0];
    expect(generate).toBeInstanceOf(GenerateDataKeyCommand);
    expect(generate.input).toEqual({
      KeyId: "arn:aws:kms:key/abc",
      KeySpec: "AES_256",
      EncryptionContext: context,
    });
    expect(kms.issued[0].every((byte) => byte === 0)).toBe(true);

    expect(await cipher.decrypt(encrypted, context)).toBe(secret);
    const [decrypt] = kms.send.mock.calls[1];
    expect(decrypt).toBeInstanceOf(DecryptCommand);
    expect(decrypt.input).toMatchObject({
      KeyId: "arn:aws:kms:key/abc",
      EncryptionContext: context,
    });
  });

  it("fails when KMS refuses the context", async () => {
    const kms = fakeKms();
    const cipher = createKmsTokenCipher("key", kms.client);
    const encrypted = await cipher.encrypt(secret, context);
    await expect(
      cipher.decrypt(encrypted, { ...context, userId: "user-2" }),
    ).rejects.toThrow("denied");
  });

  it("never sends the plaintext secret to KMS", async () => {
    const kms = fakeKms();
    await createKmsTokenCipher("key", kms.client).encrypt(secret, context);
    expect(JSON.stringify(kms.send.mock.calls)).not.toContain(secret);
  });
});

describe("getTokenCipher", () => {
  async function load() {
    return (await import("@/lib/admin/tokenCipher")).getTokenCipher;
  }

  it("has no cipher in production without a key", async () => {
    const getTokenCipher = await load();
    expect(getTokenCipher({ NODE_ENV: "production" })).toBeNull();
  });

  it("uses KMS whenever a key is configured", async () => {
    const getTokenCipher = await load();
    const cipher = getTokenCipher({
      NODE_ENV: "production",
      GMAIL_TOKEN_KMS_KEY_ID: " arn:aws:kms:ap-south-1:1:key/abc ",
    });
    expect(cipher).not.toBeNull();
    expect(getTokenCipher({ NODE_ENV: "production" })).toBe(cipher);
  });

  it("falls back to a shared in-process key in development", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const getTokenCipher = await load();
    const cipher = getTokenCipher({ NODE_ENV: "development" });
    const encrypted = await cipher!.encrypt(secret, context);

    expect(encrypted.scheme).toBe("local");
    expect(getTokenCipher({ NODE_ENV: "development" })).toBe(cipher);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0])).not.toContain(secret);
  });
});
