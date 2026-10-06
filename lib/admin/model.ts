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

/**
 * Per-user feature switches and application sending limits, set by the
 * OWNER. A user without a stored record gets `defaultUserSettings`
 * (`lib/admin/settings.ts`). These are the console's own safety limits, not
 * Google's Gmail quotas.
 */
export type UserSettings = {
  userId: string;
  sendingEnabled: boolean;
  bulkSendingEnabled: boolean;
  templatesEnabled: boolean;
  contactsEnabled: boolean;
  /** May create schedules; while off, occurrences do not send either. */
  schedulingEnabled: boolean;
  /** May create recurring schedules; while off, their occurrences fail. */
  recurringEnabled: boolean;
  /** Emails per UTC day, individual and bulk together. */
  dailyTotalEmails: number;
  /** Recipients of bulk sends per UTC day. */
  dailyBulkRecipients: number;
  maxBulkRecipientsPerOperation: number;
  /** ACTIVE schedules of either type at once. */
  maxScheduledEmails: number;
  /** ACTIVE recurring schedules at once (also counted above). */
  maxRecurringSchedules: number;
  /** How far ahead a schedule's first send may be, in days. */
  maxFutureSchedulingWindowDays: number;
  updatedAt: string | null;
  updatedBy: string | null;
};

/** A recipient saved by one user; never visible to anyone else. */
export type Contact = {
  id: string;
  userId: string;
  name: string;
  /** Normalized with `normalizeEmail`; unique per user. */
  email: string;
  company: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EmailTemplate = {
  id: string;
  userId: string;
  name: string;
  subject: string;
  /** Plain text; may contain `{{name}}`, `{{email}}`, `{{company}}`. */
  body: string;
  createdAt: string;
  updatedAt: string;
};

/**
 * RESERVED: counted against the daily limits, Gmail not yet answered.
 * SENT: Gmail accepted it. FAILED: Gmail did not take it; the reservation is
 * released. UNCERTAIN: the request may have reached Gmail (timeout, network
 * error, 5xx); it stays counted and is never retried automatically.
 */
export type SendStatus = "RESERVED" | "SENT" | "FAILED" | "UNCERTAIN";

export type SendFailureCode =
  | "not-connected"
  | "reauth-required"
  | "gmail-auth-failed"
  | "gmail-rejected"
  | "gmail-rate-limited"
  | "gmail-unavailable"
  | "not-attempted";

/**
 * One message to one recipient. Its ID is derived from the operation ID and
 * the recipient, so repeating an operation finds the same record instead of
 * sending again. The body is never stored.
 */
export type SendRecord = {
  /** `<operationId>:<recipient hash>`. */
  id: string;
  userId: string;
  operationId: string;
  senderIdentityId: string;
  gmailConnectionId: string;
  senderEmail: string;
  recipient: string;
  /** The personalized subject as sent. */
  subject: string;
  templateId: string | null;
  /** Part of an operation with more than one recipient. */
  bulk: boolean;
  /** UTC day (`YYYY-MM-DD`) whose counters this send was reserved against. */
  quotaDay: string;
  status: SendStatus;
  attempts: number;
  gmailMessageId: string | null;
  failureCode: SendFailureCode | null;
  /** Set when a schedule's occurrence made this send. */
  scheduleId?: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type DailyUsage = { total: number; bulk: number };

export type ScheduleType = "ONE_TIME" | "RECURRING";

/**
 * ACTIVE: a Scheduler trigger exists and occurrences will run. The others
 * are final: CANCELLED by the user, COMPLETED once a one-time send went out
 * or a recurrence reached its end, FAILED when a one-time send did not go
 * out or the trigger could not be created.
 */
export type ScheduleStatus = "ACTIVE" | "CANCELLED" | "COMPLETED" | "FAILED";

export const weekdays = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
] as const;

export type Weekday = (typeof weekdays)[number];

/** Days 29–31 are excluded so every month has the day. */
export const maxDayOfMonth = 28;

/**
 * A recurrence is structured data, never cron text from the user. Every
 * occurrence is at the schedule's local `time` in its time zone, every day,
 * every chosen weekday, or every month on one day.
 */
export type RecurrenceRule =
  | { frequency: "DAILY" }
  | { frequency: "WEEKLY"; weekdays: Weekday[] }
  | { frequency: "MONTHLY"; dayOfMonth: number };

/** `time` is the local `HH:mm` of every occurrence. */
export type Recurrence = RecurrenceRule & { time: string };

/** Why an occurrence (or the schedule itself) did not send. */
export type ScheduleFailureCode =
  | "user-inactive"
  | "sending-disabled"
  | "scheduling-disabled"
  | "sender-unavailable"
  | "not-connected"
  | "reauth-required"
  | "contacts-disabled"
  | "templates-disabled"
  | "template-not-found"
  | "no-recipients"
  | "recipient-not-found"
  | "invalid-recipient"
  | "bulk-disabled"
  | "bulk-limit-exceeded"
  | "daily-limit-reached"
  | "daily-bulk-limit-reached"
  | "unresolved-placeholder"
  | "invalid-message"
  | "gmail-unavailable"
  | "busy"
  | SendFailureCode
  | "missed"
  | "interrupted"
  | "scheduler-unavailable";

/**
 * A user's scheduled message. The subject and body are captured when the
 * schedule is created (later template edits do not change it); contacts are
 * kept by ID and personalized from their current details at each
 * occurrence. The sender is the identity's ID, re-checked at every send.
 */
export type Schedule = {
  id: string;
  userId: string;
  type: ScheduleType;
  status: ScheduleStatus;
  senderIdentityId: string;
  /** The identity's address when created, for display only. */
  senderEmail: string;
  contactIds: string[];
  emails: string[];
  templateId: string | null;
  subject: string;
  /** Emptied once the schedule is final, so it is kept only while needed. */
  body: string;
  /** IANA identifier, for example `Asia/Kolkata`. */
  timeZone: string;
  /** The start as entered, `YYYY-MM-DDTHH:mm` in `timeZone`. */
  startLocal: string;
  /** UTC instant of `startLocal`. */
  startAt: string;
  /** UTC; no occurrence runs after it. Recurring only. */
  endAt: string | null;
  recurrence: Recurrence | null;
  /** UTC instant of the next occurrence; `null` once final. */
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastRunStatus: ScheduleRunStatus | null;
  lastRunFailure: ScheduleFailureCode | null;
  runCount: number;
  /** The EventBridge Scheduler schedule's name within the group. */
  triggerName: string;
  /** Why the schedule became FAILED without an occurrence. */
  failureCode: ScheduleFailureCode | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  cancelledAt: string | null;
  completedAt: string | null;
};

/**
 * One occurrence of a schedule, keyed by the schedule and the occurrence's
 * local date and time, so a repeated invocation finds it instead of sending
 * again. RESERVED: claimed, outcome not recorded. SENT: every recipient was
 * sent. FAILED: nothing (or not everything) was sent, definitely.
 * UNCERTAIN: Gmail may have accepted a message; never retried.
 */
export type ScheduleRunStatus = "RESERVED" | "SENT" | "FAILED" | "UNCERTAIN";

export type ScheduleRun = {
  scheduleId: string;
  userId: string;
  /** Local `YYYY-MM-DDTHH:mm` of the occurrence in the schedule's zone. */
  occurrence: string;
  /** UTC instant EventBridge Scheduler intended. */
  scheduledFor: string;
  /** The M3 send operation ID derived from the schedule and occurrence. */
  operationId: string;
  status: ScheduleRunStatus;
  failureCode: ScheduleFailureCode | null;
  sent: number;
  failed: number;
  uncertain: number;
  createdAt: string;
  completedAt: string | null;
};

export type ScheduleCounts = { active: number; recurring: number };

export type AuditAction =
  | "auth.login"
  | "auth.logout"
  | "auth.setup"
  | "invitation.create"
  | "invitation.revoke"
  | "invitation.accept"
  | "user.status"
  | "sender.request"
  | "sender.review"
  | "gmail.connect-start"
  | "gmail.connect"
  | "gmail.check"
  | "gmail.disconnect"
  | "settings.update"
  | "send"
  | "send.retry"
  | "schedule.create"
  | "schedule.cancel"
  | "schedule.run";

/** `denied`: refused by authorization; `rate-limited`: refused by a limit. */
export type AuditOutcome = "success" | "failure" | "denied" | "rate-limited";

export type AuditDetailValue = string | number | boolean | null;

/**
 * One security- or administration-relevant event. Metadata only: IDs,
 * counts, result codes, and settings values; never a secret, token,
 * password, message subject or body, or email address.
 */
export type AuditEvent = {
  /** `<ISO timestamp>#<random>`, so a trail sorts by time. */
  id: string;
  /** Whose trail it belongs to: a user ID, or `system` without an account. */
  subject: string;
  /** The signed-in user who acted; `null` for the scheduler or anonymous. */
  actorId: string | null;
  action: AuditAction;
  outcome: AuditOutcome;
  targetId: string | null;
  detail: Record<string, AuditDetailValue>;
  at: string;
};
