import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import {
  DecryptCommand,
  GenerateDataKeyCommand,
  KMSClient,
} from "@aws-sdk/client-kms";
import type { EncryptedSecret } from "@/lib/admin/model";

/**
 * Bound into both the KMS encryption context and the AES-GCM associated
 * data, so a ciphertext only decrypts for the record it was written for. The
 * key policy only allows the function to use the key with this `purpose`.
 */
export type SecretContext = {
  purpose: "gmail-oauth-refresh-token";
  userId: string;
  senderIdentityId: string;
};

export type TokenCipher = {
  encrypt(plaintext: string, context: SecretContext): Promise<EncryptedSecret>;
  decrypt(secret: EncryptedSecret, context: SecretContext): Promise<string>;
};

type DataKeySource = {
  scheme: EncryptedSecret["scheme"];
  generate(
    context: SecretContext,
  ): Promise<{ plaintext: Buffer; encrypted: Buffer }>;
  decrypt(encrypted: Buffer, context: SecretContext): Promise<Buffer>;
};

const algorithm = "aes-256-gcm";

function associatedData(context: SecretContext) {
  return Buffer.from(
    JSON.stringify([context.purpose, context.userId, context.senderIdentityId]),
  );
}

function seal(key: Buffer, plaintext: Buffer, aad: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(algorithm, key, iv);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { iv, ciphertext, authTag: cipher.getAuthTag() };
}

function open(
  key: Buffer,
  sealed: { iv: Buffer; ciphertext: Buffer; authTag: Buffer },
  aad: Buffer,
) {
  const decipher = createDecipheriv(algorithm, key, sealed.iv);
  decipher.setAAD(aad);
  decipher.setAuthTag(sealed.authTag);
  return Buffer.concat([decipher.update(sealed.ciphertext), decipher.final()]);
}

/** A fresh data key per secret; plaintext keys are zeroed after use. */
function createEnvelopeCipher(keys: DataKeySource): TokenCipher {
  return {
    async encrypt(plaintext, context) {
      const dataKey = await keys.generate(context);
      try {
        const sealed = seal(
          dataKey.plaintext,
          Buffer.from(plaintext, "utf8"),
          associatedData(context),
        );
        return {
          version: 1,
          scheme: keys.scheme,
          encryptedDataKey: dataKey.encrypted.toString("base64"),
          iv: sealed.iv.toString("base64"),
          ciphertext: sealed.ciphertext.toString("base64"),
          authTag: sealed.authTag.toString("base64"),
        };
      } finally {
        dataKey.plaintext.fill(0);
      }
    },

    async decrypt(secret, context) {
      if (secret.version !== 1 || secret.scheme !== keys.scheme) {
        throw new Error("Unsupported credential format.");
      }
      const dataKey = await keys.decrypt(
        Buffer.from(secret.encryptedDataKey, "base64"),
        context,
      );
      try {
        return open(
          dataKey,
          {
            iv: Buffer.from(secret.iv, "base64"),
            ciphertext: Buffer.from(secret.ciphertext, "base64"),
            authTag: Buffer.from(secret.authTag, "base64"),
          },
          associatedData(context),
        ).toString("utf8");
      } finally {
        dataKey.fill(0);
      }
    },
  };
}

/** Production: data keys from the dedicated KMS key. */
export function createKmsTokenCipher(
  keyId: string,
  client: Pick<KMSClient, "send"> = new KMSClient({}),
): TokenCipher {
  return createEnvelopeCipher({
    scheme: "kms",
    async generate(context) {
      const { Plaintext, CiphertextBlob } = await client.send(
        new GenerateDataKeyCommand({
          KeyId: keyId,
          KeySpec: "AES_256",
          EncryptionContext: context,
        }),
      );
      if (!Plaintext || !CiphertextBlob) {
        throw new Error("KMS returned no data key.");
      }
      const plaintext = Buffer.from(Plaintext);
      Plaintext.fill(0);
      return { plaintext, encrypted: Buffer.from(CiphertextBlob) };
    },
    async decrypt(encrypted, context) {
      const { Plaintext } = await client.send(
        new DecryptCommand({
          KeyId: keyId,
          CiphertextBlob: encrypted,
          EncryptionContext: context,
        }),
      );
      if (!Plaintext) throw new Error("KMS returned no data key.");
      const plaintext = Buffer.from(Plaintext);
      Plaintext.fill(0);
      return plaintext;
    },
  });
}

/**
 * Local development and tests only: data keys are wrapped by a random key
 * that exists only in this process, so stored credentials stop decrypting
 * after a restart (the connection then asks to reconnect).
 */
export function createLocalTokenCipher(): TokenCipher {
  const masterKey = randomBytes(32);
  return createEnvelopeCipher({
    scheme: "local",
    async generate(context) {
      const plaintext = randomBytes(32);
      const { iv, ciphertext, authTag } = seal(
        masterKey,
        plaintext,
        associatedData(context),
      );
      return {
        plaintext,
        encrypted: Buffer.concat([iv, authTag, ciphertext]),
      };
    },
    async decrypt(encrypted, context) {
      return open(
        masterKey,
        {
          iv: encrypted.subarray(0, 12),
          authTag: encrypted.subarray(12, 28),
          ciphertext: encrypted.subarray(28),
        },
        associatedData(context),
      );
    },
  });
}

let cipher: TokenCipher | undefined;

/** Survives dev-server module reloads; never used in production. */
const devGlobal = globalThis as { adminLocalTokenCipher?: TokenCipher };

/**
 * KMS whenever `GMAIL_TOKEN_KMS_KEY_ID` is set. Without it, production has
 * no cipher (Gmail connection reports itself unavailable), and development
 * uses the in-process key.
 */
export function getTokenCipher(
  env: Record<string, string | undefined> = process.env,
): TokenCipher | null {
  if (cipher) return cipher;

  const keyId = env.GMAIL_TOKEN_KMS_KEY_ID?.trim();
  if (keyId) {
    cipher = createKmsTokenCipher(keyId);
    return cipher;
  }

  if (env.NODE_ENV === "production") return null;

  if (!devGlobal.adminLocalTokenCipher) {
    console.warn(
      "[admin] GMAIL_TOKEN_KMS_KEY_ID is not set; using a temporary in-process key.",
    );
    devGlobal.adminLocalTokenCipher = createLocalTokenCipher();
  }
  cipher = devGlobal.adminLocalTokenCipher;
  return cipher;
}
