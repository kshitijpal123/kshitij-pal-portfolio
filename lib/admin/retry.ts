import type {
  PublicUser,
  Schedule,
  SendFailureCode,
  SendRecord,
} from "@/lib/admin/model";
import {
  type RecipientResult,
  type SendDeps,
  sendEmail,
  type SendRejection,
} from "@/lib/admin/sending";
import type { AdminStore } from "@/lib/admin/store";
import {
  isWellFormedOperationId,
  type RetryMessage,
  type SendInput,
} from "@/lib/admin/validation";

/*
 * A manual retry of an operation's failed recipients. It is M3's send path,
 * not a second one: `sendEmail` runs again with the operation's original ID,
 * so every check is repeated for the signed-in user (account, switches,
 * sender approval, Gmail connection, contacts, template, bulk rules, today's
 * quota), and M3's per-recipient records decide who is sent: SENT,
 * UNCERTAIN, and RESERVED recipients are skipped, never resent; only FAILED
 * ones are reserved again, each conditional on still being FAILED.
 *
 * Nothing retries automatically. A failed scheduled occurrence stays failed
 * in its run; retrying it is a separate, explicit request by its owner.
 */

/**
 * Failures where Gmail never accepted the message and the cause can be
 * fixed or may pass: the connection, Gmail's rate limit, Google being
 * unreachable before sending, or the send stopping before the recipient.
 * `gmail-rejected` (Gmail refused this message) is not retried.
 */
export const retryableFailureCodes: ReadonlySet<SendFailureCode> = new Set([
  "not-connected",
  "reauth-required",
  "gmail-auth-failed",
  "gmail-rate-limited",
  "gmail-unavailable",
  "not-attempted",
]);

export function isRetryable(
  record: Pick<SendRecord, "status" | "failureCode">,
) {
  return (
    record.status === "FAILED" &&
    record.failureCode !== null &&
    retryableFailureCodes.has(record.failureCode)
  );
}

export type RetryBlock =
  | "not-found"
  | "nothing-to-retry"
  | "uncertain"
  | "not-retryable"
  | "schedule-ended";

export type RetryPlan = {
  operationId: string;
  records: SendRecord[];
  senderIdentityId: string;
  templateId: string | null;
  /**
   * The operation's recipients except those Gmail rejected. Recipients
   * already SENT or UNCERTAIN stay in the list (so the operation keeps its
   * size and bulk rules) and are skipped by `sendEmail`.
   */
  recipients: string[];
  retryable: number;
  source:
    | { kind: "schedule"; schedule: Schedule }
    | { kind: "compose"; subject: string; body: string };
};

/**
 * What a retry of one of the actor's operations would send, or why it
 * cannot. The message of a scheduled send comes from its schedule while it
 * is ACTIVE (bodies are kept only then). An immediate send's body was never
 * stored, so its retry needs the message entered again; `subject` and
 * `body` are suggestions for that form.
 */
export async function planRetry(
  store: AdminStore,
  actor: PublicUser,
  operationId: string,
): Promise<RetryPlan | { blocked: RetryBlock }> {
  if (!isWellFormedOperationId(operationId)) return { blocked: "not-found" };
  const records = (
    await store.listSendRecordsForOperation(actor.id, operationId)
  ).filter((record) => record.userId === actor.id);
  if (records.length === 0) return { blocked: "not-found" };

  const retryable = records.filter(isRetryable);
  if (retryable.length === 0) {
    if (
      records.some(
        (record) =>
          record.status === "UNCERTAIN" || record.status === "RESERVED",
      )
    ) {
      return { blocked: "uncertain" };
    }
    return {
      blocked: records.some((record) => record.status === "FAILED")
        ? "not-retryable"
        : "nothing-to-retry",
    };
  }

  const [first] = records;
  const recipients = records
    .filter((record) => record.status !== "FAILED" || isRetryable(record))
    .map((record) => record.recipient);
  const base = {
    operationId,
    records,
    senderIdentityId: first.senderIdentityId,
    templateId: first.templateId,
    recipients,
    retryable: retryable.length,
  };

  if (first.scheduleId) {
    const schedule = await store.getSchedule(actor.id, first.scheduleId);
    if (
      !schedule ||
      schedule.userId !== actor.id ||
      schedule.status !== "ACTIVE" ||
      !schedule.body
    ) {
      return { blocked: "schedule-ended" };
    }
    return { ...base, source: { kind: "schedule", schedule } };
  }

  const template = first.templateId
    ? await store.getTemplate(actor.id, first.templateId)
    : null;
  const sameSubject = records.every(
    (record) => record.subject === first.subject,
  );
  return {
    ...base,
    source: {
      kind: "compose",
      subject: sameSubject ? first.subject : (template?.subject ?? ""),
      body: template?.userId === actor.id ? template.body : "",
    },
  };
}

export type RetryOutcome =
  | { ok: false; reason: RetryBlock | "message-required" }
  | { ok: false; reason: "rejected"; rejection: SendRejection }
  | { ok: true; results: RecipientResult[] };

/**
 * Retries the actor's operation through `sendEmail`. `message` is required
 * for an immediate send and ignored for a scheduled one.
 */
export async function retryFailedSends(
  deps: SendDeps,
  actor: PublicUser,
  request: { operationId: string; message: RetryMessage | null },
  now: Date,
): Promise<RetryOutcome> {
  const plan = await planRetry(deps.store, actor, request.operationId);
  if ("blocked" in plan) return { ok: false, reason: plan.blocked };

  const message =
    plan.source.kind === "schedule"
      ? {
          subject: plan.source.schedule.subject,
          body: plan.source.schedule.body,
        }
      : request.message;
  if (!message) return { ok: false, reason: "message-required" };

  const input: SendInput = {
    operationId: plan.operationId,
    senderIdentityId: plan.senderIdentityId,
    contactIds: [],
    emails: plan.recipients,
    templateId: plan.templateId,
    subject: message.subject,
    body: message.body,
  };
  const outcome = await sendEmail(
    deps,
    actor,
    input,
    now,
    plan.source.kind === "schedule"
      ? { scheduleId: plan.source.schedule.id }
      : undefined,
  );
  if (!outcome.ok) return { ok: false, reason: "rejected", rejection: outcome };
  return { ok: true, results: outcome.results };
}

/** The fixed result code the retry action passes back in the URL. */
export function retryCode(outcome: RetryOutcome): RetryCode {
  if (outcome.ok) {
    return outcome.results.every(
      (result) => result.status === "SENT" || result.status === "ALREADY_SENT",
    )
      ? "retried"
      : "partial";
  }
  return outcome.reason === "rejected"
    ? outcome.rejection.reason
    : outcome.reason;
}

export type RetryNotice = { status: "success" | "error"; message: string };

const nothingSent = "Nothing was sent.";

type RetryCode =
  | "retried"
  | "partial"
  | "unavailable"
  | "failed"
  | "rate-limited"
  | "message-required"
  | RetryBlock
  | SendRejection["reason"];

const retryNotices: Record<RetryCode, RetryNotice> = {
  "no-recipients": {
    status: "error",
    message: `This operation has no recipients left to retry. ${nothingSent}`,
  },
  "recipient-not-found": {
    status: "error",
    message: `A recipient of this operation is no longer available. ${nothingSent}`,
  },
  "invalid-recipient": {
    status: "error",
    message: `A recipient address of this operation is not valid. ${nothingSent}`,
  },
  retried: {
    status: "success",
    message:
      "Retried. Every recipient of this operation has now been accepted by Gmail.",
  },
  partial: {
    status: "error",
    message:
      "Retried, but some recipients still were not sent or have an unknown outcome. See the list below.",
  },
  unavailable: {
    status: "error",
    message: `Gmail is not configured on this server. ${nothingSent}`,
  },
  failed: {
    status: "error",
    message:
      "Something went wrong. Check the recipients below before retrying again.",
  },
  "rate-limited": {
    status: "error",
    message: `Too many retries in a short time. Wait a while and try again. ${nothingSent}`,
  },
  "invalid-message": {
    status: "error",
    message: `The subject or message is missing or too long. ${nothingSent}`,
  },
  "message-required": {
    status: "error",
    message: `Enter the subject and message again to retry. ${nothingSent}`,
  },
  "not-found": { status: "error", message: "That operation was not found." },
  "nothing-to-retry": {
    status: "error",
    message: "Every recipient of this operation was already sent.",
  },
  uncertain: {
    status: "error",
    message:
      "Some sends have an unknown outcome (Gmail may have delivered them), so they are never retried. Check the sender's Gmail Sent folder.",
  },
  "not-retryable": {
    status: "error",
    message:
      "Gmail rejected these messages, so retrying would fail the same way.",
  },
  "schedule-ended": {
    status: "error",
    message: `This schedule has ended and its message is no longer stored, so its failed occurrence cannot be retried. ${nothingSent}`,
  },
  "user-inactive": {
    status: "error",
    message: `Your account is not active. ${nothingSent}`,
  },
  "sending-disabled": {
    status: "error",
    message: `Sending is turned off for your account. ${nothingSent}`,
  },
  "bulk-disabled": {
    status: "error",
    message: `Bulk sending is turned off for your account. ${nothingSent}`,
  },
  "bulk-limit-exceeded": {
    status: "error",
    message: `This operation has more recipients than your bulk limit now allows. ${nothingSent}`,
  },
  "templates-disabled": {
    status: "error",
    message: `Templates are turned off for your account. ${nothingSent}`,
  },
  "template-not-found": {
    status: "error",
    message: `The template used by this operation no longer exists. ${nothingSent}`,
  },
  "contacts-disabled": {
    status: "error",
    message: `Contacts are turned off for your account. ${nothingSent}`,
  },
  "sender-unavailable": {
    status: "error",
    message: `The sender address is no longer approved for you. ${nothingSent}`,
  },
  "not-connected": {
    status: "error",
    message: `Gmail is not connected for this sender. Connect it from the dashboard first. ${nothingSent}`,
  },
  "reauth-required": {
    status: "error",
    message: `Gmail needs to be reconnected for this sender. Reconnect it from the dashboard first. ${nothingSent}`,
  },
  "gmail-unavailable": {
    status: "error",
    message: `Google could not be reached. Try again later. ${nothingSent}`,
  },
  "daily-limit-reached": {
    status: "error",
    message: `Today's email limit (UTC) does not leave room for this retry. ${nothingSent}`,
  },
  "daily-bulk-limit-reached": {
    status: "error",
    message: `Today's bulk recipient limit (UTC) does not leave room for this retry. ${nothingSent}`,
  },
  busy: {
    status: "error",
    message: `Another send is updating your quota. Try again in a moment. ${nothingSent}`,
  },
  "unresolved-placeholder": {
    status: "error",
    message: `The message has a placeholder that cannot be filled for a recipient. ${nothingSent}`,
  },
};

export function retryNotice(code: unknown): RetryNotice | null {
  const notices: Readonly<Record<string, RetryNotice>> = retryNotices;
  return typeof code === "string" && Object.hasOwn(notices, code)
    ? notices[code]
    : null;
}
