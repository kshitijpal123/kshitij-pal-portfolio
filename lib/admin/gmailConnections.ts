import {
  gmailSendScope,
  GoogleOAuthError,
  type GoogleOAuthClient,
} from "@/lib/admin/googleOAuth";
import {
  type GmailConnection,
  oauthStateTtlMs,
  type PublicGmailConnection,
  type PublicUser,
  type SenderIdentity,
  toPublicGmailConnection,
} from "@/lib/admin/model";
import {
  isApprovedSender,
  listOwnSenderIdentities,
} from "@/lib/admin/senderIdentities";
import type { AdminStore } from "@/lib/admin/store";
import type { SecretContext, TokenCipher } from "@/lib/admin/tokenCipher";
import {
  generateToken,
  hashToken,
  isWellFormedToken,
} from "@/lib/admin/tokens";
import { normalizeEmail } from "@/lib/admin/validation";

/*
 * Sender approval (the OWNER's decision, M1) and Gmail authorization (the
 * user's Google consent, here) are independent. Connecting requires an
 * approved identity of the actor's own; using the connection requires both
 * to still hold. Ownership always comes from the session, never from input.
 */

function credentialContext(connection: {
  userId: string;
  senderIdentityId: string;
}): SecretContext {
  return {
    purpose: "gmail-oauth-refresh-token",
    userId: connection.userId,
    senderIdentityId: connection.senderIdentityId,
  };
}

/** The actor's own identity that they may connect, or `null`. */
async function ownApprovedIdentity(
  store: AdminStore,
  actor: PublicUser,
  identityId: string,
): Promise<SenderIdentity | null> {
  const identity = identityId
    ? await store.getSenderIdentity(identityId)
    : null;
  if (!identity || identity.userId !== actor.id) return null;
  return (await isApprovedSender(store, actor.id, identity.email))
    ? identity
    : null;
}

export type StartGmailConnectionResult =
  | { ok: true; authorizationUrl: string }
  | { ok: false; reason: "not-approved" };

/**
 * Records a single-use, short-lived authorization bound to this user and
 * session, and returns Google's consent URL. Only the actor's own APPROVED
 * identities qualify; anything else, including another user's identity,
 * gives the same answer.
 */
export async function startGmailConnection(
  deps: { store: AdminStore; google: GoogleOAuthClient },
  actor: PublicUser,
  sessionToken: string,
  identityId: string,
  now: Date,
): Promise<StartGmailConnectionResult> {
  const identity = await ownApprovedIdentity(deps.store, actor, identityId);
  if (!identity) return { ok: false, reason: "not-approved" };

  const state = generateToken();
  const codeVerifier = generateToken();
  const nonce = generateToken();
  await deps.store.createOAuthState({
    stateHash: hashToken(state),
    userId: actor.id,
    sessionHash: hashToken(sessionToken),
    senderIdentityId: identity.id,
    codeVerifier,
    nonce,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + oauthStateTtlMs).toISOString(),
  });
  return {
    ok: true,
    authorizationUrl: deps.google.authorizationUrl({
      state,
      codeVerifier,
      nonce,
      loginHint: identity.email,
    }),
  };
}

export type GmailCallbackOutcome =
  | "connected"
  | "signed-out"
  | "invalid-state"
  | "expired-state"
  | "denied"
  | "not-approved"
  | "email-mismatch"
  | "scope-missing"
  | "failed";

export type GmailCallbackInput = {
  /** The signed-in user for this request, from the session cookie. */
  actor: PublicUser | null;
  sessionToken: string | undefined;
  state: string | null;
  code: string | null;
  error: string | null;
};

type GmailDeps = {
  store: AdminStore;
  google: GoogleOAuthClient;
  cipher: TokenCipher;
};

/**
 * Handles Google's redirect. The state is consumed before anything else, so
 * it never works twice, whatever the outcome. Who is connecting comes from
 * the state's user and session, which must both match this request's
 * session; the callback's query carries no user or identity ID. Tokens from
 * Google are stored only when the ID token's signature and claims verify,
 * its verified address equals the approved identity's, and `gmail.send` is
 * granted.
 */
export async function completeGmailConnection(
  deps: GmailDeps,
  input: GmailCallbackInput,
  now: Date,
): Promise<GmailCallbackOutcome> {
  if (!input.state || !isWellFormedToken(input.state)) return "invalid-state";
  const pending = await deps.store.takeOAuthState(hashToken(input.state));
  if (!pending) return "invalid-state";
  if (Date.parse(pending.expiresAt) <= now.getTime()) return "expired-state";

  if (!input.actor || !input.sessionToken) return "signed-out";
  if (
    pending.userId !== input.actor.id ||
    pending.sessionHash !== hashToken(input.sessionToken)
  ) {
    return "invalid-state";
  }
  if (input.error) return "denied";
  if (!input.code) return "failed";

  const identity = await ownApprovedIdentity(
    deps.store,
    input.actor,
    pending.senderIdentityId,
  );
  if (!identity) return "not-approved";

  let tokens;
  try {
    tokens = await deps.google.exchangeCode(input.code, pending.codeVerifier);
  } catch (error) {
    if (error instanceof GoogleOAuthError) return "failed";
    throw error;
  }

  const account = tokens.idToken
    ? await deps.google.verifyIdToken(tokens.idToken, {
        nonce: pending.nonce,
        now,
      })
    : null;
  if (!account) return "failed";
  // The tokens are discarded, not revoked: revoking would also end a valid
  // connection that account may have for another of the user's identities.
  if (normalizeEmail(account.email) !== identity.email) return "email-mismatch";
  if (!tokens.scopes.includes(gmailSendScope)) return "scope-missing";
  if (!tokens.refreshToken) return "failed";

  const existing = await deps.store.getGmailConnection(identity.id);
  if (existing && existing.userId !== input.actor.id) return "failed";

  const at = now.toISOString();
  const target = { userId: input.actor.id, senderIdentityId: identity.id };
  await deps.store.saveGmailConnection({
    id: existing?.id ?? crypto.randomUUID(),
    ...target,
    provider: "GMAIL",
    email: identity.email,
    providerAccountId: account.sub,
    status: "CONNECTED",
    credentials: await deps.cipher.encrypt(
      tokens.refreshToken,
      credentialContext(target),
    ),
    scopes: tokens.scopes,
    createdAt: existing?.createdAt ?? at,
    updatedAt: at,
    connectedAt: at,
    lastValidatedAt: at,
    disconnectedAt: null,
  });
  return "connected";
}

export type GmailAccount = {
  identity: Pick<SenderIdentity, "id" | "email" | "provider" | "status">;
  connection: PublicGmailConnection | null;
  /** Both the OWNER's approval and a live Google authorization hold. */
  usable: boolean;
};

/**
 * The actor's approved identities and any identity with a connection, each
 * with its connection's public projection (never credentials).
 */
export async function listGmailAccounts(
  store: AdminStore,
  actor: PublicUser,
): Promise<GmailAccount[]> {
  const [identities, connections] = await Promise.all([
    listOwnSenderIdentities(store, actor),
    store.listGmailConnectionsForUser(actor.id),
  ]);
  const byIdentity = new Map(
    connections
      .filter((connection) => connection.userId === actor.id)
      .map((connection) => [connection.senderIdentityId, connection]),
  );
  return identities
    .filter(
      (identity) =>
        identity.status === "APPROVED" || byIdentity.has(identity.id),
    )
    .map((identity) => {
      const connection = byIdentity.get(identity.id);
      return {
        identity: {
          id: identity.id,
          email: identity.email,
          provider: identity.provider,
          status: identity.status,
        },
        connection: connection ? toPublicGmailConnection(connection) : null,
        usable:
          identity.status === "APPROVED" && connection?.status === "CONNECTED",
      };
    });
}

type RefreshResult =
  | { ok: true; accessToken: string; expiresAt: Date }
  | { ok: false; reason: "reauth-required" | "unavailable" };

/**
 * Exchanges the stored refresh token for a short-lived access token, on
 * demand. A permanent refusal (revoked, expired, undecryptable, or without
 * `gmail.send`) marks the connection REAUTH_REQUIRED and deletes the
 * credential, so it is never retried. A transient failure changes nothing.
 * The access token is never stored.
 */
async function refreshConnection(
  deps: GmailDeps,
  connection: GmailConnection,
  now: Date,
): Promise<RefreshResult> {
  if (connection.status !== "CONNECTED" || !connection.credentials) {
    return { ok: false, reason: "reauth-required" };
  }
  const context = credentialContext(connection);
  const at = now.toISOString();
  const requireReauth = async (): Promise<RefreshResult> => {
    await deps.store.saveGmailConnection({
      ...connection,
      status: "REAUTH_REQUIRED",
      credentials: null,
      updatedAt: at,
    });
    return { ok: false, reason: "reauth-required" };
  };

  let refreshToken: string;
  try {
    refreshToken = await deps.cipher.decrypt(connection.credentials, context);
  } catch {
    return requireReauth();
  }

  let tokens;
  try {
    tokens = await deps.google.refresh(refreshToken);
  } catch (error) {
    if (!(error instanceof GoogleOAuthError)) throw error;
    if (error.kind === "invalid_grant") return requireReauth();
    return { ok: false, reason: "unavailable" };
  }
  if (tokens.scopes.length > 0 && !tokens.scopes.includes(gmailSendScope)) {
    return requireReauth();
  }

  await deps.store.saveGmailConnection({
    ...connection,
    credentials: tokens.refreshToken
      ? await deps.cipher.encrypt(tokens.refreshToken, context)
      : connection.credentials,
    updatedAt: at,
    lastValidatedAt: at,
  });
  return {
    ok: true,
    accessToken: tokens.accessToken,
    expiresAt: new Date(now.getTime() + tokens.expiresInSeconds * 1000),
  };
}

export type GmailAccessResult =
  | { ok: true; email: string; accessToken: string; expiresAt: Date }
  | {
      ok: false;
      reason:
        "not-approved" | "not-connected" | "reauth-required" | "unavailable";
    };

/**
 * The gate future sending must pass: `email` is APPROVED for the actor
 * (`isApprovedSender`) and its Gmail connection is live. Returns an access
 * token for server-side use only; it must never reach a browser, a log, or
 * storage.
 */
export async function getGmailAccessToken(
  deps: GmailDeps,
  actor: PublicUser,
  email: string,
  now: Date,
): Promise<GmailAccessResult> {
  const address = normalizeEmail(email);
  if (!(await isApprovedSender(deps.store, actor.id, address))) {
    return { ok: false, reason: "not-approved" };
  }
  const identity = (await listOwnSenderIdentities(deps.store, actor)).find(
    (candidate) =>
      candidate.email === address && candidate.status === "APPROVED",
  );
  const connection = identity
    ? await deps.store.getGmailConnection(identity.id)
    : null;
  if (!connection || connection.userId !== actor.id) {
    return { ok: false, reason: "not-connected" };
  }
  if (connection.status !== "CONNECTED") {
    return {
      ok: false,
      reason:
        connection.status === "REAUTH_REQUIRED"
          ? "reauth-required"
          : "not-connected",
    };
  }

  const refreshed = await refreshConnection(deps, connection, now);
  return refreshed.ok
    ? {
        ok: true,
        email: connection.email,
        accessToken: refreshed.accessToken,
        expiresAt: refreshed.expiresAt,
      }
    : refreshed;
}

export type VerifyGmailOutcome =
  "verified" | "reauth-required" | "check-failed" | "not-found";

/** Asks Google whether the actor's own connection is still authorized. */
export async function verifyGmailConnection(
  deps: GmailDeps,
  actor: PublicUser,
  identityId: string,
  now: Date,
): Promise<VerifyGmailOutcome> {
  const connection = identityId
    ? await deps.store.getGmailConnection(identityId)
    : null;
  if (!connection || connection.userId !== actor.id) return "not-found";
  const result = await refreshConnection(deps, connection, now);
  if (result.ok) return "verified";
  return result.reason === "unavailable" ? "check-failed" : "reauth-required";
}

export type DisconnectGmailOutcome =
  "disconnected" | "disconnected-locally" | "not-found";

/**
 * Removes the actor's own connection: revokes the refresh token at Google
 * when one is held, then deletes the credential and marks it DISCONNECTED.
 * The local removal happens even if Google cannot be reached.
 */
export async function disconnectGmail(
  deps: {
    store: AdminStore;
    google: GoogleOAuthClient | null;
    cipher: TokenCipher | null;
  },
  actor: PublicUser,
  identityId: string,
  now: Date,
): Promise<DisconnectGmailOutcome> {
  const connection = identityId
    ? await deps.store.getGmailConnection(identityId)
    : null;
  if (!connection || connection.userId !== actor.id) return "not-found";

  let revoked = connection.credentials === null;
  if (connection.credentials && deps.google && deps.cipher) {
    try {
      const refreshToken = await deps.cipher.decrypt(
        connection.credentials,
        credentialContext(connection),
      );
      revoked = await deps.google.revoke(refreshToken);
    } catch {
      revoked = false;
    }
  }

  const at = now.toISOString();
  await deps.store.saveGmailConnection({
    ...connection,
    status: "DISCONNECTED",
    credentials: null,
    updatedAt: at,
    disconnectedAt: at,
  });
  return revoked ? "disconnected" : "disconnected-locally";
}

export type GmailNotice = { status: "success" | "error"; message: string };

/** Fixed messages for the dashboard's `?gmail=` result; never echoes input. */
const gmailNotices: Record<string, GmailNotice> = {
  connected: {
    status: "success",
    message: "Gmail is connected for this address.",
  },
  verified: {
    status: "success",
    message: "Google still authorizes this connection.",
  },
  disconnected: {
    status: "success",
    message: "Gmail is disconnected, and Google has revoked the app's access.",
  },
  "disconnected-locally": {
    status: "success",
    message:
      "Gmail is disconnected here, and its stored authorization is deleted. Google did not confirm the revocation; you can also remove access in your Google Account's security settings.",
  },
  "signed-out": {
    status: "error",
    message: "Your session ended. Sign in and connect Gmail again.",
  },
  "invalid-state": {
    status: "error",
    message:
      "That Gmail connection attempt is invalid or was already used. Start again from this page.",
  },
  "expired-state": {
    status: "error",
    message: "That Gmail connection attempt expired. Start again.",
  },
  denied: {
    status: "error",
    message: "Google authorization was cancelled. Nothing was connected.",
  },
  "not-approved": {
    status: "error",
    message: "Only your own approved sender identities can connect to Gmail.",
  },
  "email-mismatch": {
    status: "error",
    message:
      "The Google account you chose is not the approved address. Nothing was connected; try again and choose the matching account.",
  },
  "scope-missing": {
    status: "error",
    message:
      "Google did not grant permission to send email. Nothing was connected; try again and allow sending.",
  },
  "reauth-required": {
    status: "error",
    message: "Google no longer accepts this connection. Reconnect Gmail.",
  },
  "check-failed": {
    status: "error",
    message:
      "Google could not be reached. The connection was not changed; try again later.",
  },
  "not-found": {
    status: "error",
    message: "That Gmail connection was not found.",
  },
  failed: {
    status: "error",
    message: "The Gmail request could not be completed. Please try again.",
  },
  unavailable: {
    status: "error",
    message: "Gmail connection is not configured on this server.",
  },
};

/** The message for a `?gmail=` result code, or `null` for anything else. */
export function gmailNotice(
  code: string | string[] | undefined,
): GmailNotice | null {
  return typeof code === "string" && Object.hasOwn(gmailNotices, code)
    ? gmailNotices[code]
    : null;
}
