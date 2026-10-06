import type {
  GmailConnection,
  Invitation,
  OAuthState,
  SenderIdentity,
  SenderIdentityStatus,
  Session,
  User,
  UserStatus,
} from "@/lib/admin/model";

export type CreateOwnerResult = "created" | "owner-exists";

export type CreateInvitationResult =
  "created" | "capacity-full" | "already-user" | "already-invited";

export type AcceptInvitationResult = "accepted" | "unavailable" | "email-taken";

export type SenderReview = {
  /** The transition applies only from one of these statuses. */
  from: readonly SenderIdentityStatus[];
  to: Exclude<SenderIdentityStatus, "REQUESTED">;
  reviewedBy: string;
  reviewedAt: string;
  rejectionReason: string | null;
};

/**
 * Persistence for the private console. Every method is a single atomic
 * operation; rules that must hold under concurrency (one OWNER, unique
 * emails, the seat limit, one-time invitations) are enforced inside it.
 * No method authorizes anything: callers pass an already-authorized actor's
 * data.
 */
export type AdminStore = {
  ownerExists(): Promise<boolean>;
  /** Creates the single OWNER; fails once any OWNER exists. */
  createOwner(user: User): Promise<CreateOwnerResult>;
  getUserById(id: string): Promise<User | null>;
  getUserByEmail(email: string): Promise<User | null>;
  listUsers(): Promise<User[]>;
  recordLogin(userId: string, at: string): Promise<void>;
  /**
   * Changes a USER's status (never an OWNER's). Disabling also invalidates
   * the user's existing sessions. `false` when no such USER exists.
   */
  setUserStatus(
    userId: string,
    status: UserStatus,
    at: string,
  ): Promise<boolean>;

  listInvitations(): Promise<Invitation[]>;
  getInvitationByTokenHash(tokenHash: string): Promise<Invitation | null>;
  /** Inserts only while a seat is free and the email is not taken or invited. */
  createInvitation(
    invitation: Invitation,
    maxSeats: number,
    now: Date,
  ): Promise<CreateInvitationResult>;
  /**
   * Marks a PENDING, unexpired invitation ACCEPTED and creates its user, in
   * one step, so an invitation can never be used twice.
   */
  acceptInvitation(
    invitationId: string,
    user: User,
    now: Date,
  ): Promise<AcceptInvitationResult>;
  /** `false` unless the invitation exists and is PENDING. */
  revokeInvitation(invitationId: string, at: string): Promise<boolean>;

  createSession(session: Session): Promise<void>;
  getSession(tokenHash: string): Promise<Session | null>;
  deleteSession(tokenHash: string): Promise<void>;

  /** Failures recorded for `key` within the current window. */
  getFailedAttempts(key: string, now: Date, windowMs: number): Promise<number>;
  recordFailedAttempt(
    key: string,
    now: Date,
    windowMs: number,
  ): Promise<number>;
  clearFailedAttempts(key: string): Promise<void>;

  /** `false` when the address is already REQUESTED or APPROVED by anyone. */
  createSenderIdentity(identity: SenderIdentity): Promise<boolean>;
  getSenderIdentity(id: string): Promise<SenderIdentity | null>;
  listSenderIdentities(): Promise<SenderIdentity[]>;
  listSenderIdentitiesForUser(userId: string): Promise<SenderIdentity[]>;
  /** `false` when the identity does not exist or is not in `from`. */
  reviewSenderIdentity(id: string, review: SenderReview): Promise<boolean>;

  createOAuthState(state: OAuthState): Promise<void>;
  /**
   * Deletes and returns a pending authorization in one step, so a state
   * value can be redeemed at most once. Expiry is the caller's check.
   */
  takeOAuthState(stateHash: string): Promise<OAuthState | null>;

  /** At most one connection per sender identity. */
  getGmailConnection(senderIdentityId: string): Promise<GmailConnection | null>;
  listGmailConnectionsForUser(userId: string): Promise<GmailConnection[]>;
  /** Creates or replaces the connection for its sender identity. */
  saveGmailConnection(connection: GmailConnection): Promise<void>;
};
