import type { GmailClient, GmailSendResult } from "@/lib/admin/gmailApi";
import { gmailSendScope } from "@/lib/admin/googleOAuth";
import type { GmailConnection, PublicUser } from "@/lib/admin/model";
import type { AdminStore } from "@/lib/admin/store";
import type { TokenCipher } from "@/lib/admin/tokenCipher";
import { now } from "@/tests/helpers/admin";
import { refreshToken, seedApprovedIdentity } from "@/tests/helpers/gmail";

/** An approved identity with a CONNECTED Gmail connection holding a real
 * (locally encrypted) refresh token, as M2's callback would store it. */
export async function seedConnectedSender(
  store: AdminStore,
  cipher: TokenCipher,
  owner: PublicUser,
  user: PublicUser,
  email: string,
) {
  const identity = await seedApprovedIdentity(store, owner, user, email);
  const at = now.toISOString();
  const connection: GmailConnection = {
    id: `gmail-${identity.id}`,
    userId: user.id,
    senderIdentityId: identity.id,
    provider: "GMAIL",
    email,
    providerAccountId: `sub-${email}`,
    status: "CONNECTED",
    credentials: await cipher.encrypt(refreshToken, {
      purpose: "gmail-oauth-refresh-token",
      userId: user.id,
      senderIdentityId: identity.id,
    }),
    scopes: ["openid", "email", gmailSendScope],
    createdAt: at,
    updatedAt: at,
    connectedAt: at,
    lastValidatedAt: at,
    disconnectedAt: null,
  };
  await store.saveGmailConnection(connection);
  return { identity, connection };
}

type Respond = (call: {
  index: number;
  accessToken: string;
  raw: string;
}) => GmailSendResult | Promise<GmailSendResult>;

/** A stand-in for Gmail's `users.messages.send`; no network. */
export function createFakeGmail(respond?: Respond) {
  const calls: { accessToken: string; raw: string }[] = [];
  const client: GmailClient = {
    async send(accessToken, raw) {
      const index = calls.length;
      calls.push({ accessToken, raw });
      return respond
        ? respond({ index, accessToken, raw })
        : { ok: true, messageId: `gmail-message-${index + 1}` };
    },
  };
  return {
    client,
    calls,
    messages: () => calls.map((call) => decodeRaw(call.raw)),
  };
}

/** Splits a base64url `raw` message into its headers and decoded body. */
export function decodeRaw(raw: string) {
  const mime = Buffer.from(raw, "base64url").toString("utf8");
  const [head, encodedBody = ""] = mime.split("\r\n\r\n");
  const headers: Record<string, string> = {};
  for (const line of head.replace(/\r\n /g, " ").split("\r\n")) {
    const colon = line.indexOf(":");
    headers[line.slice(0, colon)] = line.slice(colon + 1).trim();
  }
  return {
    mime,
    headers,
    body: Buffer.from(encodedBody.replace(/\r\n/g, ""), "base64").toString(
      "utf8",
    ),
  };
}

/** Decodes RFC 2047 B-encoded words in a header value. */
export function decodeHeader(value: string) {
  return value
    .split(" ")
    .map((word) => {
      const match = /^=\?UTF-8\?B\?(.*)\?=$/.exec(word);
      return match ? Buffer.from(match[1], "base64").toString("utf8") : word;
    })
    .join(value.startsWith("=?") ? "" : " ");
}
