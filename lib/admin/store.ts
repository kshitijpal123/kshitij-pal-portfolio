import type {
  Contact,
  DailyUsage,
  EmailTemplate,
  GmailConnection,
  Invitation,
  OAuthState,
  Schedule,
  ScheduleCounts,
  ScheduleFailureCode,
  ScheduleRun,
  ScheduleRunStatus,
  ScheduleStatus,
  SendFailureCode,
  SendRecord,
  SenderIdentity,
  SenderIdentityStatus,
  Session,
  User,
  UserSettings,
  UserStatus,
} from "@/lib/admin/model";

export type ContactWriteResult = "saved" | "duplicate" | "not-found";

export type ReserveSendsRequest = {
  userId: string;
  /** UTC day whose counters are charged. */
  day: string;
  bulk: boolean;
  limits: Pick<UserSettings, "dailyTotalEmails" | "dailyBulkRecipients">;
  /** New RESERVED records; each must not exist yet. */
  create: SendRecord[];
  /** RESERVED replacements for records that must still be FAILED. */
  retry: SendRecord[];
};

/**
 * `limit`: the reservation would exceed a daily limit; nothing was written.
 * `conflict`: another request created or changed one of the records first.
 */
export type ReserveSendsResult = "reserved" | "limit" | "conflict";

export type SendCompletion =
  | { status: "SENT"; gmailMessageId: string; at: string }
  | {
      status: "FAILED" | "UNCERTAIN";
      failureCode: SendFailureCode;
      at: string;
    };

export type ScheduleLimits = Pick<
  UserSettings,
  "maxScheduledEmails" | "maxRecurringSchedules"
>;

/** `limit`: an active-schedule limit would be exceeded; nothing written. */
export type CreateScheduleResult = "created" | "limit";

/** A final state for an ACTIVE schedule. */
export type ScheduleEnd = {
  status: Exclude<ScheduleStatus, "ACTIVE">;
  at: string;
  failureCode: ScheduleFailureCode | null;
};

/**
 * `duplicate`: this occurrence was already claimed (whatever its outcome).
 * `not-active`: the schedule is no longer ACTIVE; nothing was written.
 */
export type ClaimRunResult = "claimed" | "duplicate" | "not-active";

export type RunCompletion = {
  status: Exclude<ScheduleRunStatus, "RESERVED">;
  failureCode: ScheduleFailureCode | null;
  sent: number;
  failed: number;
  uncertain: number;
  at: string;
};

/** After an occurrence: the next one, or the schedule's final state. */
export type ScheduleAdvance =
  { kind: "next"; nextRunAt: string } | { kind: "end"; end: ScheduleEnd };

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

  /** `null` when the user has never had settings saved (use the defaults). */
  getUserSettings(userId: string): Promise<UserSettings | null>;
  saveUserSettings(settings: UserSettings): Promise<void>;

  /*
   * Contacts, templates, and send records are addressed by their owner's
   * user ID as well as their own: a record of another user cannot be read
   * or written through these methods whatever ID is passed.
   */
  listContacts(userId: string): Promise<Contact[]>;
  getContact(userId: string, contactId: string): Promise<Contact | null>;
  /** `duplicate` when the user already has a contact with this email. */
  createContact(
    contact: Contact,
  ): Promise<Exclude<ContactWriteResult, "not-found">>;
  /**
   * Replaces a contact whose stored email is still `previousEmail`, moving
   * the per-user unique-email lock when the email changes.
   */
  updateContact(
    contact: Contact,
    previousEmail: string,
  ): Promise<ContactWriteResult>;
  /** `false` unless the contact existed with this email. */
  deleteContact(
    userId: string,
    contactId: string,
    email: string,
  ): Promise<boolean>;

  listTemplates(userId: string): Promise<EmailTemplate[]>;
  getTemplate(
    userId: string,
    templateId: string,
  ): Promise<EmailTemplate | null>;
  createTemplate(template: EmailTemplate): Promise<void>;
  /** `false` when the template does not exist. */
  updateTemplate(template: EmailTemplate): Promise<boolean>;
  deleteTemplate(userId: string, templateId: string): Promise<boolean>;

  getDailyUsage(userId: string, day: string): Promise<DailyUsage>;
  /**
   * In one atomic step: charges `create.length + retry.length` sends to the
   * day's counters (and the bulk counter when `bulk`) only if every limit
   * still holds, and writes the records only if none was created or changed
   * meanwhile. Concurrent reservations can never exceed a limit.
   */
  reserveSends(request: ReserveSendsRequest): Promise<ReserveSendsResult>;
  /**
   * Finalizes a RESERVED record once. FAILED also gives its reservation
   * back to the counters, in the same atomic step. `false` when the record
   * was no longer RESERVED.
   */
  finishSend(record: SendRecord, completion: SendCompletion): Promise<boolean>;
  listSendRecordsForOperation(
    userId: string,
    operationId: string,
  ): Promise<SendRecord[]>;
  /** Newest operations first. */
  listRecentSendRecords(userId: string, limit: number): Promise<SendRecord[]>;

  /*
   * Schedules (M4) are addressed by their owner like other mail data. Only
   * `findSchedule`, used by the scheduler's execution function, which knows
   * nothing but a schedule ID, looks one up without the owner.
   */
  listSchedules(userId: string): Promise<Schedule[]>;
  getSchedule(userId: string, scheduleId: string): Promise<Schedule | null>;
  findSchedule(scheduleId: string): Promise<Schedule | null>;
  getScheduleCounts(userId: string): Promise<ScheduleCounts>;
  /**
   * Inserts an ACTIVE schedule and counts it against the owner's active
   * (and, if recurring, recurring) limits in one atomic step; concurrent
   * creations can never exceed a limit.
   */
  createSchedule(
    schedule: Schedule,
    limits: ScheduleLimits,
  ): Promise<CreateScheduleResult>;
  /**
   * Moves an ACTIVE schedule to a final state and releases its count, in one
   * step. `false` when it was no longer ACTIVE.
   */
  endSchedule(schedule: Schedule, end: ScheduleEnd): Promise<boolean>;
  /**
   * Creates the RESERVED run for an occurrence, only if the occurrence was
   * never claimed and the schedule is still ACTIVE, in one step.
   */
  claimScheduleRun(run: ScheduleRun): Promise<ClaimRunResult>;
  getScheduleRun(
    userId: string,
    scheduleId: string,
    occurrence: string,
  ): Promise<ScheduleRun | null>;
  /**
   * Finalizes a RESERVED run and, while the schedule is still ACTIVE,
   * records it on the schedule and applies `advance` (releasing the count
   * when the schedule ends), atomically. A schedule cancelled meanwhile
   * keeps its status but still records the run's outcome.
   */
  finishScheduleRun(
    schedule: Schedule,
    run: ScheduleRun,
    completion: RunCompletion,
    advance: ScheduleAdvance,
  ): Promise<void>;
};
