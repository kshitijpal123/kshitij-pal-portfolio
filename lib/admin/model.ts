/** Hard product limit: one OWNER plus at most four USER accounts. */
export const maxUsers = 5;

export const sessionTtlMs = 7 * 24 * 60 * 60 * 1000;

export const invitationTtlMs = 72 * 60 * 60 * 1000;

export type Role = "OWNER" | "USER";

/**
 * A person who has been invited but has not accepted yet is a PENDING
 * invitation, not a user record; users are created when they accept.
 */
export type UserStatus = "ACTIVE" | "DISABLED";

export type User = {
  id: string;
  /** Normalized with `normalizeEmail`. */
  email: string;
  name: string;
  passwordHash: string;
  role: Role;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
  /** Sessions created before this instant are rejected (set on disable). */
  sessionsValidAfter: string | null;
};

/** Everything about a user that may leave the server. */
export type PublicUser = Pick<
  User,
  | "id"
  | "email"
  | "name"
  | "role"
  | "status"
  | "createdAt"
  | "updatedAt"
  | "lastLoginAt"
>;

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastLoginAt: user.lastLoginAt,
  };
}

export type InvitationStatus = "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED";

export type Invitation = {
  id: string;
  email: string;
  /** Invitations only ever create USER accounts. */
  role: "USER";
  status: InvitationStatus;
  /** SHA-256 of the token; the token itself is never stored. */
  tokenHash: string;
  expiresAt: string;
  createdAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  /** User ID of the OWNER who created it. */
  invitedBy: string;
};

export type PublicInvitation = Omit<Invitation, "tokenHash">;

/** A PENDING invitation past its expiry is EXPIRED, whatever is stored. */
export function effectiveInvitationStatus(
  invitation: Invitation,
  now: Date,
): InvitationStatus {
  return invitation.status === "PENDING" &&
    Date.parse(invitation.expiresAt) <= now.getTime()
    ? "EXPIRED"
    : invitation.status;
}

export function toPublicInvitation(
  invitation: Invitation,
  now: Date,
): PublicInvitation {
  return {
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    status: effectiveInvitationStatus(invitation, now),
    expiresAt: invitation.expiresAt,
    createdAt: invitation.createdAt,
    acceptedAt: invitation.acceptedAt,
    revokedAt: invitation.revokedAt,
    invitedBy: invitation.invitedBy,
  };
}

/**
 * Seats in use: every user account (disabled accounts keep their seat, since
 * they can be re-enabled) plus every invitation that can still be accepted.
 */
export function countUsedSeats(
  users: readonly User[],
  invitations: readonly Invitation[],
  now: Date,
) {
  const pending = invitations.filter(
    (invitation) => effectiveInvitationStatus(invitation, now) === "PENDING",
  ).length;
  return users.length + pending;
}

export type Session = {
  /** SHA-256 of the cookie token. */
  tokenHash: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
};

export type SenderProvider = "GMAIL";

export type SenderIdentityStatus =
  "REQUESTED" | "APPROVED" | "REJECTED" | "DISABLED";

/**
 * A request to send as an address. APPROVED is the OWNER's internal
 * authorization only; it is not a Gmail/Google OAuth authorization.
 */
export type SenderIdentity = {
  id: string;
  userId: string;
  email: string;
  provider: SenderProvider;
  status: SenderIdentityStatus;
  requestedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  rejectionReason: string | null;
};

export const oauthStateTtlMs = 10 * 60 * 1000;

/**
 * A pending Google authorization, keyed by the SHA-256 of the `state` value
 * sent to Google. It is bound to the user and session that started it and is
 * deleted when the callback reads it, so it works once.
 */
export type OAuthState = {
  stateHash: string;
  userId: string;
  /** SHA-256 of the session cookie that started the flow. */
  sessionHash: string;
  senderIdentityId: string;
  /** PKCE verifier; only useful together with Google's one-time code. */
  codeVerifier: string;
  nonce: string;
  createdAt: string;
  expiresAt: string;
};

/**
 * Envelope encryption: `ciphertext` is AES-256-GCM under a one-off data key,
 * and `encryptedDataKey` is that key encrypted by KMS (or, in local
 * development only, by an in-process key).
 */
export type EncryptedSecret = {
  version: 1;
  scheme: "kms" | "local";
  encryptedDataKey: string;
  iv: string;
  ciphertext: string;
  authTag: string;
};

/**
 * Whether Google still authorizes sending. Separate from, and never implied
 * by, the sender identity's APPROVED status. "Not connected" is the absence
 * of a connection.
 */
export type GmailConnectionStatus =
  "CONNECTED" | "REAUTH_REQUIRED" | "DISCONNECTED";

/** One Google authorization for one of the user's sender identities. */
export type GmailConnection = {
  id: string;
  userId: string;
  senderIdentityId: string;
  provider: SenderProvider;
  /** The Google account's verified address; equals the identity's email. */
  email: string;
  /** Google's stable account ID (the ID token's `sub`). */
  providerAccountId: string;
  status: GmailConnectionStatus;
  /** The encrypted refresh token; `null` once disconnected or unusable. */
  credentials: EncryptedSecret | null;
  scopes: string[];
  createdAt: string;
  updatedAt: string;
  connectedAt: string;
  lastValidatedAt: string | null;
  disconnectedAt: string | null;
};

/** Everything about a connection that may leave the server. */
export type PublicGmailConnection = Omit<GmailConnection, "credentials">;

export function toPublicGmailConnection(
  connection: GmailConnection,
): PublicGmailConnection {
  return {
    id: connection.id,
    userId: connection.userId,
    senderIdentityId: connection.senderIdentityId,
    provider: connection.provider,
    email: connection.email,
    providerAccountId: connection.providerAccountId,
    status: connection.status,
    scopes: connection.scopes,
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt,
    connectedAt: connection.connectedAt,
    lastValidatedAt: connection.lastValidatedAt,
    disconnectedAt: connection.disconnectedAt,
  };
}
