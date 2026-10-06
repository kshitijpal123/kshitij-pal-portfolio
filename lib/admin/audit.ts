import { randomBytes } from "node:crypto";
import type {
  AuditAction,
  AuditDetailValue,
  AuditEvent,
  AuditOutcome,
  PublicUser,
} from "@/lib/admin/model";
import type { AdminStore } from "@/lib/admin/store";

/*
 * The audit trail records who did what to which record, and how it ended.
 * Each event lives in one trail: the acting user's (or, for an occurrence
 * run by the scheduler, the schedule owner's), or `system` when no account
 * is known (a sign-in attempt for an unknown address, a wrong setup token).
 * A USER reads only their own trail; the OWNER may read any trail. Events
 * hold metadata only, and `sanitizeAuditDetail` enforces that on every write.
 */

export const systemAuditSubject = "system";

export const auditPageSize = 50;

const maxDetailKeys = 16;
const maxDetailString = 120;

/** Keys that could name a secret, a credential, or message content. */
const forbiddenKeys =
  /token|secret|password|passwd|credential|cookie|authorization|verifier|nonce|^state$|^code$|auth.?code|body|subject|content|^email$/i;

const emailLike = /[^\s@]+@[^\s@]+/;

/**
 * Keeps only primitive values under harmless keys, truncates strings, and
 * redacts anything that looks like an email address. Prototype keys and
 * secrets cannot reach the table, whatever a caller passes.
 */
export function sanitizeAuditDetail(
  detail: Record<string, unknown>,
): Record<string, AuditDetailValue> {
  const safe: [string, AuditDetailValue][] = [];
  for (const [key, value] of Object.entries(detail)) {
    if (safe.length >= maxDetailKeys) break;
    if (
      !/^[A-Za-z][A-Za-z0-9-]{0,39}$/.test(key) ||
      forbiddenKeys.test(key) ||
      key === "constructor" ||
      key === "prototype"
    ) {
      continue;
    }
    if (typeof value === "string") {
      safe.push([
        key,
        emailLike.test(value) ? "[redacted]" : value.slice(0, maxDetailString),
      ]);
    } else if (typeof value === "number") {
      if (Number.isFinite(value)) safe.push([key, value]);
    } else if (typeof value === "boolean" || value === null) {
      safe.push([key, value]);
    }
  }
  return Object.fromEntries(safe);
}

export type AuditInput = {
  subject: string;
  actorId: string | null;
  action: AuditAction;
  outcome: AuditOutcome;
  targetId?: string | null;
  detail?: Record<string, unknown>;
};

/**
 * Appends an event. Best effort: the action it describes has already
 * happened, so a failed write is logged (fixed words only) and swallowed.
 */
export async function recordAudit(
  store: AdminStore,
  input: AuditInput,
  now: Date,
): Promise<void> {
  const at = now.toISOString();
  const event: AuditEvent = {
    id: `${at}#${randomBytes(12).toString("base64url")}`,
    subject: input.subject,
    actorId: input.actorId,
    action: input.action,
    outcome: input.outcome,
    targetId: input.targetId ?? null,
    detail: sanitizeAuditDetail(input.detail ?? {}),
    at,
  };
  try {
    await store.appendAuditEvent(event);
  } catch (error) {
    const name = error instanceof Error ? error.name : "UnknownError";
    console.error(`[admin] Audit write failed (${name}).`);
  }
}

const auditIdPattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z#[A-Za-z0-9_-]{16}$/;

export type AuditTrail = {
  subject: string;
  events: AuditEvent[];
  /** Cursor for the next page, or `null` at the end. */
  next: string | null;
};

/**
 * A trail the actor may read: their own, or, for the OWNER, any user's or
 * the system trail. `null` for anything else, including another user's
 * trail requested by a USER. The cursor is only a sort key; the partition
 * comes from the authorized subject.
 */
export async function listAuditTrail(
  store: AdminStore,
  actor: PublicUser,
  subject: string,
  cursor: string | null,
): Promise<AuditTrail | null> {
  if (subject !== actor.id) {
    if (actor.role !== "OWNER") return null;
    if (subject !== systemAuditSubject && !(await store.getUserById(subject))) {
      return null;
    }
  }
  const after = cursor && auditIdPattern.test(cursor) ? cursor : null;
  const page = await store.listAuditEvents(subject, {
    after,
    limit: auditPageSize,
  });
  return {
    subject,
    events: page.items.filter((event) => event.subject === subject),
    next: page.last,
  };
}

const actionLabels: Record<AuditAction, string> = {
  "auth.login": "Sign-in",
  "auth.logout": "Sign-out",
  "auth.setup": "Owner setup",
  "invitation.create": "Invitation created",
  "invitation.revoke": "Invitation revoked",
  "invitation.accept": "Invitation accepted",
  "user.status": "Account status changed",
  "sender.request": "Sender identity requested",
  "sender.review": "Sender identity reviewed",
  "gmail.connect-start": "Gmail connection started",
  "gmail.connect": "Gmail connection completed",
  "gmail.check": "Gmail connection checked",
  "gmail.disconnect": "Gmail disconnected",
  "settings.update": "Settings changed",
  send: "Send",
  "send.retry": "Retry",
  "schedule.create": "Schedule created",
  "schedule.cancel": "Schedule cancelled",
  "schedule.run": "Scheduled occurrence",
};

export function describeAuditAction(action: AuditAction) {
  return actionLabels[action];
}
