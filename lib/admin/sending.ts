import { createHash, randomBytes } from "node:crypto";
import type { GmailClient } from "@/lib/admin/gmailApi";
import {
  getGmailAccessToken,
  verifyGmailConnection,
} from "@/lib/admin/gmailConnections";
import {
  gmailSendScope,
  type GoogleOAuthClient,
} from "@/lib/admin/googleOAuth";
import {
  buildMimeMessage,
  encodeForGmail,
  InvalidMessageError,
} from "@/lib/admin/mimeMessage";
import type {
  Contact,
  GmailConnection,
  PublicUser,
  SendFailureCode,
  SendRecord,
  SenderIdentity,
  UserSettings,
} from "@/lib/admin/model";
import {
  personalize,
  type PlaceholderProblem,
} from "@/lib/admin/personalization";
import { getUserSettings, quotaDay } from "@/lib/admin/settings";
import type { AdminStore, SendCompletion } from "@/lib/admin/store";
import type { TokenCipher } from "@/lib/admin/tokenCipher";
import {
  describePlaceholderProblem,
  isHeaderSafeEmail,
  isWellFormedOperationId,
  normalizeEmail,
  type SendDraft,
  type SendInput,
} from "@/lib/admin/validation";

/*
 * An explicit, synchronous send: one request, one finite set of recipients,
 * one Gmail message per recipient. Everything that decides whether and as
 * whom mail goes out is re-read on the server for the actor (the session's
 * user, or a schedule's owner when an occurrence runs): account status,
 * settings and limits, sender ownership and approval, the Gmail connection,
 * contacts, and templates. The form or schedule supplies only IDs and text.
 */

/** Gmail calls in flight at once within one request. */
export const sendConcurrency = 4;

/**
 * Recipients not started within this budget are released, not sent, so a
 * request finishes inside the function's 15-second timeout.
 */
export const sendDeadlineMs = 10_000;

/** A new idempotency key for one compose operation, made on the server. */
export function newOperationId(now: Date) {
  return `${String(now.getTime()).padStart(13, "0")}.${randomBytes(16).toString("base64url")}`;
}

/** Deterministic per operation and recipient, so a repeat finds the record. */
export function sendRecordId(operationId: string, recipient: string) {
  const hash = createHash("sha256").update(recipient).digest("hex");
  return `${operationId}:${hash.slice(0, 32)}`;
}

export type SendDeps = {
  store: AdminStore;
  google: GoogleOAuthClient;
  cipher: TokenCipher;
  gmail: GmailClient;
  /** The current time while sending; tests pass a fixed clock. */
  clock?: () => Date;
};

export type SendRejection =
  | {
      reason:
        | "user-inactive"
        | "sending-disabled"
        | "sender-unavailable"
        | "not-connected"
        | "reauth-required"
        | "contacts-disabled"
        | "templates-disabled"
        | "template-not-found"
        | "no-recipients"
        | "recipient-not-found"
        | "bulk-disabled"
        | "invalid-message"
        | "gmail-unavailable"
        | "busy";
    }
  | { reason: "invalid-recipient"; email: string }
  | { reason: "bulk-limit-exceeded"; requested: number; max: number }
  | {
      reason: "daily-limit-reached" | "daily-bulk-limit-reached";
      requested: number;
      used: number;
      limit: number;
    }
  | { reason: "unresolved-placeholder"; problem: PlaceholderProblem };

export type RecipientStatus =
  "SENT" | "FAILED" | "UNCERTAIN" | "ALREADY_SENT" | "IN_PROGRESS";

export type RecipientResult = {
  email: string;
  status: RecipientStatus;
  failureCode: SendFailureCode | null;
};

export type SendOutcome =
  ({ ok: false } & SendRejection) | { ok: true; results: RecipientResult[] };

function reject(rejection: SendRejection): SendOutcome {
  return { ok: false, ...rejection };
}

type Sender = { identity: SenderIdentity; connection: GmailConnection };

/**
 * The actor's own APPROVED identity and its live connection, or why not.
 * Another user's identity gives the same answer as a missing one.
 */
async function resolveSender(
  store: AdminStore,
  actor: PublicUser,
  identityId: string,
): Promise<Sender | SendRejection> {
  const identity = identityId
    ? await store.getSenderIdentity(identityId)
    : null;
  if (
    !identity ||
    identity.userId !== actor.id ||
    identity.status !== "APPROVED" ||
    !isHeaderSafeEmail(identity.email)
  ) {
    return { reason: "sender-unavailable" };
  }
  const connection = await store.getGmailConnection(identity.id);
  if (
    !connection ||
    connection.userId !== actor.id ||
    connection.senderIdentityId !== identity.id ||
    connection.email !== identity.email
  ) {
    return { reason: "not-connected" };
  }
  if (connection.status === "REAUTH_REQUIRED") {
    return { reason: "reauth-required" };
  }
  if (connection.status !== "CONNECTED" || !connection.credentials) {
    return { reason: "not-connected" };
  }
  if (!connection.scopes.includes(gmailSendScope)) {
    return { reason: "reauth-required" };
  }
  return { identity, connection };
}

type Recipient = { email: string; contact: Contact | null };

/**
 * The actor's chosen contacts and typed addresses, deduplicated by
 * normalized email. A typed address that matches one of the actor's
 * contacts is personalized from that contact.
 */
async function resolveRecipients(
  store: AdminStore,
  actor: PublicUser,
  settings: UserSettings,
  input: Pick<SendDraft, "contactIds" | "emails">,
): Promise<Recipient[] | SendRejection> {
  if (input.contactIds.length > 0 && !settings.contactsEnabled) {
    return { reason: "contacts-disabled" };
  }
  const contacts = settings.contactsEnabled
    ? await store.listContacts(actor.id)
    : [];
  const owned = contacts.filter((contact) => contact.userId === actor.id);
  const byId = new Map(owned.map((contact) => [contact.id, contact]));
  const byEmail = new Map(owned.map((contact) => [contact.email, contact]));

  const recipients = new Map<string, Recipient>();
  for (const id of input.contactIds) {
    const contact = byId.get(id);
    if (!contact) return { reason: "recipient-not-found" };
    if (!isHeaderSafeEmail(contact.email)) {
      return { reason: "invalid-recipient", email: contact.email };
    }
    recipients.set(contact.email, { email: contact.email, contact });
  }
  for (const raw of input.emails) {
    const email = normalizeEmail(raw);
    if (!isHeaderSafeEmail(email)) {
      return { reason: "invalid-recipient", email: email.slice(0, 60) };
    }
    if (!recipients.has(email)) {
      recipients.set(email, { email, contact: byEmail.get(email) ?? null });
    }
  }
  return [...recipients.values()];
}

type PreparedMessage = {
  id: string;
  recipient: string;
  subject: string;
  raw: string;
};

/** Personalizes and encodes every message before anything is reserved. */
function prepareMessages(
  operationId: string,
  input: SendDraft,
  sender: Sender,
  recipients: Recipient[],
  now: Date,
): PreparedMessage[] | SendRejection {
  const messages: PreparedMessage[] = [];
  for (const recipient of recipients) {
    const values = {
      name: recipient.contact?.name ?? null,
      email: recipient.email,
      company: recipient.contact?.company ?? null,
    };
    const subject = personalize(input.subject, values);
    if (!subject.ok) {
      return { reason: "unresolved-placeholder", problem: subject.problem };
    }
    const body = personalize(input.body, values);
    if (!body.ok) {
      return { reason: "unresolved-placeholder", problem: body.problem };
    }
    let raw: string;
    try {
      raw = encodeForGmail(
        buildMimeMessage({
          from: sender.identity.email,
          to: recipient.email,
          subject: subject.text,
          body: body.text,
          date: now,
        }),
      );
    } catch (error) {
      if (error instanceof InvalidMessageError) {
        return { reason: "invalid-message" };
      }
      throw error;
    }
    messages.push({
      id: sendRecordId(operationId, recipient.email),
      recipient: recipient.email,
      subject: subject.text,
      raw,
    });
  }
  return messages;
}

const priorResults: Record<
  Exclude<SendRecord["status"], "FAILED">,
  RecipientStatus
> = {
  SENT: "ALREADY_SENT",
  RESERVED: "IN_PROGRESS",
  UNCERTAIN: "UNCERTAIN",
};

type Reservation = {
  reserved: { record: SendRecord; raw: string }[];
  /** Recipients an earlier attempt of this operation already handled. */
  skipped: Map<string, RecipientResult>;
};

/**
 * Reserves the sends this operation has not made yet. A recipient already
 * SENT, RESERVED, or UNCERTAIN under this operation ID is skipped, never
 * sent again; a FAILED one is retried. All recipients are reserved together
 * or none is.
 */
async function reserve(
  store: AdminStore,
  actor: PublicUser,
  settings: UserSettings,
  context: {
    input: SendInput;
    sender: Sender;
    templateId: string | null;
    bulk: boolean;
    scheduleId: string | undefined;
    now: Date;
  },
  messages: PreparedMessage[],
): Promise<Reservation | SendRejection> {
  const { input, sender, templateId, bulk, scheduleId, now } = context;
  const day = quotaDay(now);
  const at = now.toISOString();

  for (let attempt = 0; attempt < 2; attempt++) {
    const existing = new Map(
      (await store.listSendRecordsForOperation(actor.id, input.operationId))
        .filter((record) => record.userId === actor.id)
        .map((record) => [record.id, record]),
    );
    const create: SendRecord[] = [];
    const retry: SendRecord[] = [];
    const reserved: Reservation["reserved"] = [];
    const skipped = new Map<string, RecipientResult>();

    for (const message of messages) {
      const prior = existing.get(message.id);
      if (prior && prior.status !== "FAILED") {
        skipped.set(message.id, {
          email: message.recipient,
          status: priorResults[prior.status],
          failureCode: prior.failureCode,
        });
        continue;
      }
      const record: SendRecord = {
        id: message.id,
        userId: actor.id,
        operationId: input.operationId,
        senderIdentityId: sender.identity.id,
        gmailConnectionId: sender.connection.id,
        senderEmail: sender.identity.email,
        recipient: message.recipient,
        subject: message.subject,
        templateId,
        bulk,
        quotaDay: day,
        status: "RESERVED",
        attempts: (prior?.attempts ?? 0) + 1,
        gmailMessageId: null,
        failureCode: null,
        ...(scheduleId ? { scheduleId } : {}),
        createdAt: prior?.createdAt ?? at,
        updatedAt: at,
        completedAt: null,
      };
      (prior ? retry : create).push(record);
      reserved.push({ record, raw: message.raw });
    }

    if (reserved.length === 0) return { reserved, skipped };
    const result = await store.reserveSends({
      userId: actor.id,
      day,
      bulk,
      limits: settings,
      create,
      retry,
    });
    if (result === "reserved") return { reserved, skipped };
    if (result === "limit") {
      const usage = await store.getDailyUsage(actor.id, day);
      const requested = reserved.length;
      return usage.total + requested > settings.dailyTotalEmails
        ? {
            reason: "daily-limit-reached",
            requested,
            used: usage.total,
            limit: settings.dailyTotalEmails,
          }
        : {
            reason: "daily-bulk-limit-reached",
            requested,
            used: usage.bulk,
            limit: settings.dailyBulkRecipients,
          };
    }
    // `conflict`: a concurrent request with this operation ID got there
    // first; look again so its records are skipped.
  }
  return { reason: "busy" };
}

const accessFailures = {
  "not-approved": { rejection: "sender-unavailable", code: "not-connected" },
  "not-connected": { rejection: "not-connected", code: "not-connected" },
  "reauth-required": { rejection: "reauth-required", code: "reauth-required" },
  unavailable: { rejection: "gmail-unavailable", code: "gmail-unavailable" },
} as const;

type CheckedSend = {
  settings: UserSettings;
  sender: Sender;
  recipients: Recipient[];
  bulk: boolean;
  templateId: string | null;
};

/**
 * Every check that can refuse a send before anything is reserved: the
 * actor's account and settings, sender ownership, approval and connection,
 * recipients, bulk limits, and the template. `operationId`, when given, must
 * be well formed.
 */
async function checkSend(
  store: AdminStore,
  actor: PublicUser,
  draft: SendDraft,
  operationId: string | null,
): Promise<CheckedSend | SendRejection> {
  const user = await store.getUserById(actor.id);
  if (!user || user.status !== "ACTIVE") return { reason: "user-inactive" };
  const settings = await getUserSettings(store, actor.id);
  if (!settings.sendingEnabled) return { reason: "sending-disabled" };
  if (operationId !== null && !isWellFormedOperationId(operationId)) {
    return { reason: "invalid-message" };
  }

  const sender = await resolveSender(store, actor, draft.senderIdentityId);
  if ("reason" in sender) return sender;

  const recipients = await resolveRecipients(store, actor, settings, draft);
  if ("reason" in recipients) return recipients;
  if (recipients.length === 0) return { reason: "no-recipients" };
  const bulk = recipients.length > 1;
  if (bulk && !settings.bulkSendingEnabled) return { reason: "bulk-disabled" };
  if (bulk && recipients.length > settings.maxBulkRecipientsPerOperation) {
    return {
      reason: "bulk-limit-exceeded",
      requested: recipients.length,
      max: settings.maxBulkRecipientsPerOperation,
    };
  }

  let templateId: string | null = null;
  if (draft.templateId) {
    if (!settings.templatesEnabled) return { reason: "templates-disabled" };
    const template = await store.getTemplate(actor.id, draft.templateId);
    if (!template || template.userId !== actor.id) {
      return { reason: "template-not-found" };
    }
    templateId = template.id;
  }
  return { settings, sender, recipients, bulk, templateId };
}

/**
 * Runs the same checks and personalization as `sendEmail` without reserving
 * or sending anything; `null` when the draft could be sent now. Schedules
 * use it when they are created; every occurrence still goes through
 * `sendEmail`.
 */
export async function checkSendDraft(
  store: AdminStore,
  actor: PublicUser,
  draft: SendDraft,
  now: Date,
): Promise<SendRejection | null> {
  const checked = await checkSend(store, actor, draft, null);
  if ("reason" in checked) return checked;
  const messages = prepareMessages(
    "",
    draft,
    checked.sender,
    checked.recipients,
    now,
  );
  return "reason" in messages ? messages : null;
}

/**
 * Who started a send. A scheduled occurrence passes its schedule so its
 * records say so; it gets no other treatment: every check below applies to
 * the schedule's owner exactly as to a user pressing Send.
 */
export type SendContext = { scheduleId: string };

/**
 * Sends a message from one of the actor's approved, connected sender
 * identities to each recipient, individually. Nothing is reserved or sent
 * unless every check passes and every message can be personalized.
 */
export async function sendEmail(
  deps: SendDeps,
  actor: PublicUser,
  input: SendInput,
  now: Date,
  context?: SendContext,
): Promise<SendOutcome> {
  const { store } = deps;
  const clock = deps.clock ?? (() => new Date());

  const checked = await checkSend(store, actor, input, input.operationId);
  if ("reason" in checked) return reject(checked);
  const { settings, sender, recipients, bulk, templateId } = checked;

  const messages = prepareMessages(
    input.operationId,
    input,
    sender,
    recipients,
    now,
  );
  if ("reason" in messages) return reject(messages);

  const reservation = await reserve(
    store,
    actor,
    settings,
    {
      input,
      sender,
      templateId,
      bulk,
      scheduleId: context?.scheduleId,
      now,
    },
    messages,
  );
  if ("reason" in reservation) return reject(reservation);

  const outcomes = new Map(reservation.skipped);
  const finish = async (record: SendRecord, completion: SendCompletion) => {
    outcomes.set(record.id, {
      email: record.recipient,
      status: completion.status,
      failureCode: completion.status === "SENT" ? null : completion.failureCode,
    });
    try {
      await store.finishSend(record, completion);
    } catch {
      // The record stays RESERVED: still counted and never resent, which
      // is the safe side when the outcome cannot be recorded.
    }
  };

  if (reservation.reserved.length > 0) {
    const gmailDeps = {
      store,
      google: deps.google,
      cipher: deps.cipher,
    };
    const access = await getGmailAccessToken(
      gmailDeps,
      actor,
      sender.identity.email,
      now,
    );
    if (!access.ok || access.email !== sender.identity.email) {
      const failure =
        accessFailures[access.ok ? "not-connected" : access.reason];
      const at = clock().toISOString();
      for (const { record } of reservation.reserved) {
        await finish(record, {
          status: "FAILED",
          failureCode: failure.code,
          at,
        });
      }
      return reject({ reason: failure.rejection });
    }

    const queue = [...reservation.reserved];
    const deadline = clock().getTime() + sendDeadlineMs;
    let halt: SendFailureCode | null = null;
    let authCheck: Promise<SendFailureCode> | null = null;
    // A refused token: ask M2's refresh whether the grant itself is gone
    // (it then marks the connection REAUTH_REQUIRED). Checked once.
    const checkAuthorization = async (): Promise<SendFailureCode> => {
      try {
        const outcome = await verifyGmailConnection(
          gmailDeps,
          actor,
          sender.identity.id,
          now,
        );
        return outcome === "reauth-required"
          ? "reauth-required"
          : "gmail-auth-failed";
      } catch {
        return "gmail-auth-failed";
      }
    };

    const worker = async () => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        const { record, raw } = item;
        if (halt || clock().getTime() >= deadline) {
          await finish(record, {
            status: "FAILED",
            failureCode: halt ?? "not-attempted",
            at: clock().toISOString(),
          });
          continue;
        }
        const result = await deps.gmail
          .send(access.accessToken, raw)
          .catch(() => ({ ok: false, kind: "uncertain" }) as const);
        const at = clock().toISOString();
        if (result.ok) {
          await finish(record, {
            status: "SENT",
            gmailMessageId: result.messageId,
            at,
          });
          continue;
        }
        switch (result.kind) {
          case "auth": {
            halt = "gmail-auth-failed";
            authCheck ??= checkAuthorization();
            halt = await authCheck;
            await finish(record, { status: "FAILED", failureCode: halt, at });
            break;
          }
          case "rate-limited":
            halt = "gmail-rate-limited";
            await finish(record, { status: "FAILED", failureCode: halt, at });
            break;
          case "rejected":
            await finish(record, {
              status: "FAILED",
              failureCode: "gmail-rejected",
              at,
            });
            break;
          case "uncertain":
            halt ??= "not-attempted";
            await finish(record, {
              status: "UNCERTAIN",
              failureCode: "gmail-unavailable",
              at,
            });
            break;
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(sendConcurrency, queue.length) }, worker),
    );
  }

  return {
    ok: true,
    results: messages.map(
      (message) =>
        outcomes.get(message.id) ?? {
          email: message.recipient,
          status: "IN_PROGRESS",
          failureCode: null,
        },
    ),
  };
}

/** A safe, user-facing explanation; never includes Google's responses. */
export function describeSendRejection(rejection: SendRejection): string {
  switch (rejection.reason) {
    case "user-inactive":
      return "Your account is not active.";
    case "sending-disabled":
      return "Sending is turned off for your account. Ask the owner to enable it.";
    case "sender-unavailable":
      return "Choose one of your own approved sender addresses.";
    case "not-connected":
      return "Gmail is not connected for this address. Connect it from the dashboard first.";
    case "reauth-required":
      return "Google no longer accepts this Gmail connection. Reconnect Gmail from the dashboard. Nothing was sent.";
    case "contacts-disabled":
      return "Contacts are turned off for your account. Enter addresses instead.";
    case "templates-disabled":
      return "Templates are turned off for your account.";
    case "template-not-found":
      return "That template was not found.";
    case "no-recipients":
      return "Choose at least one recipient.";
    case "recipient-not-found":
      return "One of the chosen contacts was not found. Reload the page and try again.";
    case "invalid-recipient":
      return `${rejection.email} is not a valid email address. Nothing was sent.`;
    case "bulk-disabled":
      return "Sending to more than one recipient at once is turned off for your account. Nothing was sent.";
    case "bulk-limit-exceeded":
      return `This send has ${rejection.requested} recipients, and your limit is ${rejection.max} per send. Nothing was sent.`;
    case "daily-limit-reached":
      return `Daily sending limit reached: ${rejection.used} of ${rejection.limit} emails used today (UTC), and this send needs ${rejection.requested}. Nothing was sent.`;
    case "daily-bulk-limit-reached":
      return `Daily bulk limit reached: ${rejection.used} of ${rejection.limit} bulk recipients used today (UTC), and this send needs ${rejection.requested}. Nothing was sent.`;
    case "unresolved-placeholder":
      return `${describePlaceholderProblem(rejection.problem)} Nothing was sent.`;
    case "invalid-message":
      return "The message could not be built from this subject or address. Nothing was sent.";
    case "gmail-unavailable":
      return "Google could not be reached. Nothing was sent; try again later.";
    case "busy":
      return "This send is already being processed. Check the history before sending again.";
  }
}

const failureDescriptions: Record<SendFailureCode, string> = {
  "not-connected": "Not sent: Gmail is not connected for this address.",
  "reauth-required":
    "Not sent: Google no longer accepts the connection. Reconnect Gmail.",
  "gmail-auth-failed": "Not sent: Google refused the authorization.",
  "gmail-rejected": "Not sent: Gmail rejected this message.",
  "gmail-rate-limited":
    "Not sent: Gmail's own sending rate limit was reached. Try again later.",
  "gmail-unavailable":
    "Outcome unknown: Gmail did not answer clearly. Check the Sent folder in Gmail before sending again.",
  "not-attempted":
    "Not sent: sending stopped before this recipient. Sending again retries it.",
};

export function describeRecipientResult(result: RecipientResult): string {
  switch (result.status) {
    case "SENT":
      return "Sent.";
    case "ALREADY_SENT":
      return "Already sent by an earlier attempt; not sent again.";
    case "IN_PROGRESS":
      return "An earlier attempt is in progress or its outcome is unknown; not sent again.";
    case "UNCERTAIN":
      return failureDescriptions["gmail-unavailable"];
    case "FAILED":
      return failureDescriptions[result.failureCode ?? "not-attempted"];
  }
}

export function describeFailureCode(code: SendFailureCode) {
  return failureDescriptions[code];
}
