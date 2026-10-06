"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { recordAudit, systemAuditSubject } from "@/lib/admin/audit";
import {
  bootstrapOwner,
  endSession,
  getBootstrapToken,
  login,
} from "@/lib/admin/auth";
import {
  type ContactOutcome,
  createContact,
  deleteContact,
  updateContact,
} from "@/lib/admin/contacts";
import type { ComposeState, FormState } from "@/lib/admin/formState";
import { getAdminStore } from "@/lib/admin/getAdminStore";
import { getGmailClient } from "@/lib/admin/gmailApi";
import {
  disconnectGmail,
  startGmailConnection,
  verifyGmailConnection,
} from "@/lib/admin/gmailConnections";
import { getGoogleOAuthClient } from "@/lib/admin/googleOAuth";
import {
  acceptInvitation,
  createInvitation,
  invitationPath,
  revokeInvitation,
} from "@/lib/admin/invitations";
import {
  type AuditAction,
  type AuditOutcome,
  maxUsers,
  type PublicUser,
} from "@/lib/admin/model";
import {
  consumeRateLimit,
  type RateLimitedAction,
} from "@/lib/admin/rateLimit";
import { formatInZone } from "@/lib/admin/recurrence";
import {
  retryCode,
  retryFailedSends,
  type RetryOutcome,
} from "@/lib/admin/retry";
import { getScheduleTriggers } from "@/lib/admin/scheduler";
import {
  cancelSchedule,
  createSchedule,
  describeScheduleRejection,
} from "@/lib/admin/schedules";
import {
  requestSenderIdentity,
  reviewSenderIdentity,
  type SenderDecision,
} from "@/lib/admin/senderIdentities";
import {
  clearSessionCookie,
  getCurrentUser,
  readSessionCookie,
  requireUser,
  setSessionCookie,
} from "@/lib/admin/session";
import {
  describeRecipientResult,
  describeSendRejection,
  newOperationId,
  sendEmail,
  type SendOutcome,
} from "@/lib/admin/sending";
import { updateUserSettings } from "@/lib/admin/settings";
import {
  createTemplate,
  deleteTemplate,
  type TemplateOutcome,
  updateTemplate,
} from "@/lib/admin/templates";
import { getTokenCipher } from "@/lib/admin/tokenCipher";
import { setUserStatus } from "@/lib/admin/users";
import {
  isWellFormedOperationId,
  normalizeEmail,
  readField,
  type RetryMessage,
  validateContact,
  validateEmailField,
  validateLogin,
  validateNewAccount,
  validateOwnerSetup,
  validateRejectionReason,
  validateRetryMessage,
  validateSchedule,
  validateSend,
  validateSettings,
  validateTemplate,
} from "@/lib/admin/validation";

/*
 * Server Actions are public endpoints: each one resolves the actor from the
 * session cookie through `requireUser()` and lets the service functions
 * authorize. No action reads a role or a user ID from the form to decide who
 * the actor is or what they may do. `redirect()` throws, so it is always
 * called outside `try`.
 */

const unexpected: FormState = {
  status: "error",
  message: "Something went wrong. Please try again.",
};

/** Logs a fixed message and the error's name only; never input or tokens. */
function logFailure(operation: string, error: unknown) {
  const name = error instanceof Error ? error.name : "UnknownError";
  console.error(`[admin] ${operation} failed (${name}).`);
}

/** Records an event in the signed-in actor's own audit trail. */
function audit(
  actor: PublicUser,
  action: AuditAction,
  outcome: AuditOutcome,
  targetId: string | null = null,
  detail: Record<string, unknown> = {},
) {
  return recordAudit(
    getAdminStore(),
    { subject: actor.id, actorId: actor.id, action, outcome, targetId, detail },
    new Date(),
  );
}

/**
 * Counts one use of a per-user limit, keyed by the session's user ID.
 * `true` when the actor is over it; the refusal is audited when `action` is
 * given. A store failure throws, so the action fails closed.
 */
async function rateLimited(
  actor: PublicUser,
  limit: RateLimitedAction,
  action?: AuditAction,
) {
  if (await consumeRateLimit(getAdminStore(), limit, actor.id, new Date())) {
    return false;
  }
  if (action) await audit(actor, action, "rate-limited", null, { limit });
  return true;
}

const rateLimitedMessage =
  "Too many requests in a short time. Wait a few minutes and try again.";

const ownerOutcome = (actor: PublicUser, ok: boolean): AuditOutcome =>
  actor.role !== "OWNER" ? "denied" : ok ? "success" : "failure";

/** Counts per outcome; never recipients, subjects, or bodies. */
function sendAuditDetail(operationId: string, outcome: SendOutcome) {
  if (!outcome.ok) return { operationId, reason: outcome.reason };
  const count = (...statuses: string[]) =>
    outcome.results.filter((result) => statuses.includes(result.status)).length;
  return {
    operationId,
    recipients: outcome.results.length,
    sent: count("SENT"),
    failed: count("FAILED"),
    uncertain: count("UNCERTAIN"),
    skipped: count("ALREADY_SENT", "IN_PROGRESS"),
  };
}

function retryAuditDetail(operationId: string, outcome: RetryOutcome) {
  if (outcome.ok) {
    return {
      ...sendAuditDetail(operationId, outcome),
      result: retryCode(outcome),
    };
  }
  return { operationId, result: retryCode(outcome) };
}

export async function loginAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = validateLogin(formData);
  const values = { email: normalizeEmail(readField(formData, "email")) };
  if (!parsed.success) {
    return { status: "error", fieldErrors: parsed.errors, values };
  }

  let result;
  try {
    result = await login(getAdminStore(), parsed.data, new Date());
  } catch (error) {
    logFailure("Login", error);
    return { ...unexpected, values };
  }

  if (!result.ok) {
    return {
      status: "error",
      message:
        result.reason === "throttled"
          ? "Too many attempts. Try again in 15 minutes."
          : "Invalid email or password.",
      values,
    };
  }

  await setSessionCookie(result);
  redirect("/admin");
}

export async function logoutAction() {
  try {
    const user = await getCurrentUser();
    await endSession(getAdminStore(), await readSessionCookie());
    if (user) await audit(user, "auth.logout", "success");
  } catch (error) {
    logFailure("Logout", error);
  }
  await clearSessionCookie();
  redirect("/admin/login");
}

export async function setupOwnerAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = validateOwnerSetup(formData);
  const values = {
    name: readField(formData, "name"),
    email: normalizeEmail(readField(formData, "email")),
  };
  if (!parsed.success) {
    return { status: "error", fieldErrors: parsed.errors, values };
  }

  let result;
  try {
    result = await bootstrapOwner(
      getAdminStore(),
      parsed.data,
      getBootstrapToken(),
      new Date(),
    );
  } catch (error) {
    logFailure("Owner setup", error);
    return { ...unexpected, values };
  }

  if (!result.ok) {
    if (result.reason === "invalid-token") {
      await recordAudit(
        getAdminStore(),
        {
          subject: systemAuditSubject,
          actorId: null,
          action: "auth.setup",
          outcome: "failure",
          detail: { reason: "invalid-token" },
        },
        new Date(),
      );
      return {
        status: "error",
        fieldErrors: { setupToken: "The setup token is incorrect." },
        values,
      };
    }
    return {
      status: "error",
      message:
        result.reason === "throttled"
          ? "Too many attempts. Try again in 15 minutes."
          : "Setup is not available.",
      values,
    };
  }

  await audit(result.user, "auth.setup", "success", result.user.id);
  await setSessionCookie(result);
  redirect("/admin");
}

export async function acceptInvitationAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const token = readField(formData, "token");
  const parsed = validateNewAccount(formData);
  const values = { name: readField(formData, "name") };
  if (!parsed.success) {
    return { status: "error", fieldErrors: parsed.errors, values };
  }

  let result;
  try {
    const store = getAdminStore();
    result = await acceptInvitation(store, token, parsed.data, new Date());
    if (result.ok) await endSession(store, await readSessionCookie());
  } catch (error) {
    logFailure("Invitation acceptance", error);
    return { ...unexpected, values };
  }

  if (!result.ok) {
    return {
      status: "error",
      message:
        result.reason === "email-taken"
          ? "An account with this email already exists. Sign in instead."
          : "This invitation is invalid, expired, or already used.",
      values,
    };
  }

  await audit(result.user, "invitation.accept", "success", result.user.id);
  await setSessionCookie(result);
  redirect("/admin");
}

const invitationFailures = {
  forbidden: "Only the owner can invite users.",
  "capacity-full": `All ${maxUsers} seats are in use, counting pending invitations. Revoke an invitation before inviting someone else.`,
  "already-user": "This person already has an account.",
  "already-invited": "This person already has a pending invitation.",
} as const;

export async function createInvitationAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireUser();
  const parsed = validateEmailField(formData);
  const values = { email: normalizeEmail(readField(formData, "email")) };
  if (!parsed.success) {
    return { status: "error", fieldErrors: parsed.errors, values };
  }

  let outcome;
  try {
    if (await rateLimited(actor, "invitation", "invitation.create")) {
      return { status: "error", message: rateLimitedMessage, values };
    }
    outcome = await createInvitation(
      getAdminStore(),
      actor,
      parsed.data.email,
      new Date(),
    );
  } catch (error) {
    logFailure("Invitation", error);
    return { ...unexpected, values };
  }

  await audit(
    actor,
    "invitation.create",
    outcome.ok
      ? "success"
      : outcome.reason === "forbidden"
        ? "denied"
        : "failure",
    outcome.ok ? outcome.invitation.id : null,
    outcome.ok ? {} : { reason: outcome.reason },
  );
  if (!outcome.ok) {
    return {
      status: "error",
      message: invitationFailures[outcome.reason],
      values,
    };
  }

  revalidatePath("/admin/users");
  return {
    status: "success",
    message: `Invitation created for ${outcome.invitation.email}.`,
    invitationPath: invitationPath(outcome.token),
  };
}

export async function revokeInvitationAction(formData: FormData) {
  const actor = await requireUser();
  if (await rateLimited(actor, "administration", "invitation.revoke")) return;
  const invitationId = readField(formData, "invitationId");
  const revoked = await revokeInvitation(
    getAdminStore(),
    actor,
    invitationId,
    new Date(),
  );
  await audit(
    actor,
    "invitation.revoke",
    ownerOutcome(actor, revoked),
    invitationId || null,
  );
  revalidatePath("/admin/users");
}

export async function setUserStatusAction(formData: FormData) {
  const actor = await requireUser();
  const status = readField(formData, "status");
  if (status !== "ACTIVE" && status !== "DISABLED") return;
  if (await rateLimited(actor, "administration", "user.status")) return;
  const userId = readField(formData, "userId");
  const changed = await setUserStatus(
    getAdminStore(),
    actor,
    userId,
    status,
    new Date(),
  );
  await audit(
    actor,
    "user.status",
    ownerOutcome(actor, changed),
    userId || null,
    {
      status,
    },
  );
  revalidatePath("/admin/users");
  revalidatePath("/admin/settings");
}

export async function requestSenderIdentityAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireUser();
  const parsed = validateEmailField(formData);
  const values = { email: normalizeEmail(readField(formData, "email")) };
  if (!parsed.success) {
    return { status: "error", fieldErrors: parsed.errors, values };
  }

  let created;
  try {
    if (await rateLimited(actor, "sender-request", "sender.request")) {
      return { status: "error", message: rateLimitedMessage, values };
    }
    created = await requestSenderIdentity(
      getAdminStore(),
      actor,
      parsed.data.email,
      new Date(),
    );
  } catch (error) {
    logFailure("Sender identity request", error);
    return { ...unexpected, values };
  }

  await audit(
    actor,
    "sender.request",
    created ? "success" : "failure",
    null,
    created ? {} : { reason: "address-claimed" },
  );
  if (!created) {
    return {
      status: "error",
      message: "This address already has a pending or approved request.",
      values,
    };
  }

  revalidatePath("/admin/senders");
  return {
    status: "success",
    message: `Requested ${parsed.data.email}. The owner will review it.`,
  };
}

const decisions = new Set<string>(["approve", "reject", "disable"]);

export async function reviewSenderIdentityAction(formData: FormData) {
  const actor = await requireUser();
  const decision = readField(formData, "decision");
  const reason = validateRejectionReason(readField(formData, "reason"));
  if (!decisions.has(decision) || !reason.success) return;
  if (await rateLimited(actor, "sender-review", "sender.review")) return;
  const identityId = readField(formData, "identityId");
  const reviewed = await reviewSenderIdentity(
    getAdminStore(),
    actor,
    identityId,
    decision as SenderDecision,
    reason.reason,
    new Date(),
  );
  await audit(
    actor,
    "sender.review",
    ownerOutcome(actor, reviewed),
    identityId || null,
    { decision },
  );
  revalidatePath("/admin/approvals");
}

/*
 * Gmail actions take only a sender identity ID from the form; the domain
 * functions accept it only when it belongs to the signed-in user. Results
 * come back to the dashboard as a fixed `?gmail=` code, never as tokens.
 */
const gmailResult = (code: string) => `/admin?gmail=${code}`;

export async function startGmailConnectionAction(formData: FormData) {
  const actor = await requireUser();
  const sessionToken = await readSessionCookie();
  const google = getGoogleOAuthClient();
  const cipher = getTokenCipher();

  let destination = gmailResult("unavailable");
  if (google && cipher && sessionToken) {
    try {
      const identityId = readField(formData, "identityId");
      if (await rateLimited(actor, "gmail-connect", "gmail.connect-start")) {
        destination = gmailResult("rate-limited");
      } else {
        const outcome = await startGmailConnection(
          { store: getAdminStore(), google },
          actor,
          sessionToken,
          identityId,
          new Date(),
        );
        await audit(
          actor,
          "gmail.connect-start",
          outcome.ok ? "success" : "denied",
          identityId || null,
          outcome.ok ? {} : { reason: outcome.reason },
        );
        destination = outcome.ok
          ? outcome.authorizationUrl
          : gmailResult(outcome.reason);
      }
    } catch (error) {
      logFailure("Gmail connection start", error);
      destination = gmailResult("failed");
    }
  }
  redirect(destination);
}

export async function verifyGmailConnectionAction(formData: FormData) {
  const actor = await requireUser();
  const google = getGoogleOAuthClient();
  const cipher = getTokenCipher();

  let outcome: string = "unavailable";
  if (google && cipher) {
    try {
      const identityId = readField(formData, "identityId");
      if (await rateLimited(actor, "gmail-manage", "gmail.check")) {
        outcome = "rate-limited";
      } else {
        outcome = await verifyGmailConnection(
          { store: getAdminStore(), google, cipher },
          actor,
          identityId,
          new Date(),
        );
        await audit(
          actor,
          "gmail.check",
          outcome === "not-found" ? "denied" : "success",
          identityId || null,
          { result: outcome },
        );
      }
    } catch (error) {
      logFailure("Gmail connection check", error);
      outcome = "check-failed";
    }
  }
  redirect(gmailResult(outcome));
}

export async function disconnectGmailAction(formData: FormData) {
  const actor = await requireUser();

  let outcome: string;
  try {
    const identityId = readField(formData, "identityId");
    if (await rateLimited(actor, "gmail-manage", "gmail.disconnect")) {
      outcome = "rate-limited";
    } else {
      outcome = await disconnectGmail(
        {
          store: getAdminStore(),
          google: getGoogleOAuthClient(),
          cipher: getTokenCipher(),
        },
        actor,
        identityId,
        new Date(),
      );
      await audit(
        actor,
        "gmail.disconnect",
        outcome === "not-found" ? "denied" : "success",
        identityId || null,
        { result: outcome },
      );
    }
  } catch (error) {
    logFailure("Gmail disconnect", error);
    outcome = "failed";
  }
  redirect(gmailResult(outcome));
}

/*
 * Mail actions (M3). Contacts, templates, and sends are always the signed-in
 * user's own: the domain functions take the actor from `requireUser()` and
 * look records up under that user's ID. A `userId` in the form is never
 * read. Results are fixed messages; nothing from Google is passed through.
 */

const contactFailures: Record<Exclude<ContactOutcome, "saved">, string> = {
  duplicate: "You already have a contact with this email.",
  "not-found": "That contact was not found.",
  disabled: "Contacts are turned off for your account.",
  limit: "You have reached the maximum number of contacts.",
};

function textValues(formData: FormData, fields: readonly string[]) {
  return Object.fromEntries(
    fields.map((field) => [field, readField(formData, field)]),
  );
}

export async function saveContactAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireUser();
  const contactId = readField(formData, "contactId");
  const values = textValues(formData, ["name", "email", "company", "notes"]);
  const parsed = validateContact(formData);
  if (!parsed.success) {
    return { status: "error", fieldErrors: parsed.errors, values };
  }

  let outcome: ContactOutcome;
  try {
    if (await rateLimited(actor, "content")) {
      return { status: "error", message: rateLimitedMessage, values };
    }
    const store = getAdminStore();
    outcome = contactId
      ? await updateContact(store, actor, contactId, parsed.data, new Date())
      : await createContact(store, actor, parsed.data, new Date());
  } catch (error) {
    logFailure("Contact save", error);
    return { ...unexpected, values };
  }

  if (outcome !== "saved") {
    return { status: "error", message: contactFailures[outcome], values };
  }
  revalidatePath("/admin/contacts");
  if (contactId) redirect("/admin/contacts");
  return { status: "success", message: `Saved ${parsed.data.name}.` };
}

export async function deleteContactAction(formData: FormData) {
  const actor = await requireUser();
  if (await rateLimited(actor, "content")) return;
  await deleteContact(getAdminStore(), actor, readField(formData, "contactId"));
  revalidatePath("/admin/contacts");
}

const templateFailures: Record<Exclude<TemplateOutcome, "saved">, string> = {
  "not-found": "That template was not found.",
  disabled: "Templates are turned off for your account.",
  limit: "You have reached the maximum number of templates.",
};

export async function saveTemplateAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireUser();
  const templateId = readField(formData, "templateId");
  const values = textValues(formData, ["name", "subject", "body"]);
  const parsed = validateTemplate(formData);
  if (!parsed.success) {
    return { status: "error", fieldErrors: parsed.errors, values };
  }

  let outcome: TemplateOutcome;
  try {
    if (await rateLimited(actor, "content")) {
      return { status: "error", message: rateLimitedMessage, values };
    }
    const store = getAdminStore();
    outcome = templateId
      ? await updateTemplate(store, actor, templateId, parsed.data, new Date())
      : await createTemplate(store, actor, parsed.data, new Date());
  } catch (error) {
    logFailure("Template save", error);
    return { ...unexpected, values };
  }

  if (outcome !== "saved") {
    return { status: "error", message: templateFailures[outcome], values };
  }
  revalidatePath("/admin/templates");
  if (templateId) redirect("/admin/templates");
  return { status: "success", message: `Saved ${parsed.data.name}.` };
}

export async function deleteTemplateAction(formData: FormData) {
  const actor = await requireUser();
  if (await rateLimited(actor, "content")) return;
  await deleteTemplate(
    getAdminStore(),
    actor,
    readField(formData, "templateId"),
  );
  revalidatePath("/admin/templates");
}

/**
 * Sends synchronously within this request. The form carries an idempotency
 * key (`operationId`) made by the server; a repeated submission with it
 * never sends to the same recipient twice.
 */
export async function sendEmailAction(
  previous: ComposeState,
  formData: FormData,
): Promise<ComposeState> {
  const actor = await requireUser();
  const parsed = validateSend(formData);
  const operationId = parsed.success
    ? parsed.data.operationId
    : previous.operationId;
  if (!parsed.success) {
    return {
      status: "error",
      operationId,
      fieldErrors: parsed.errors,
      message: "Check the highlighted fields. Nothing was sent.",
    };
  }

  const google = getGoogleOAuthClient();
  const cipher = getTokenCipher();
  if (!google || !cipher) {
    return {
      status: "error",
      operationId,
      message: "Gmail is not configured on this server. Nothing was sent.",
    };
  }

  let outcome;
  try {
    const bulk = parsed.data.contactIds.length + parsed.data.emails.length > 1;
    if (
      (await rateLimited(actor, "send", "send")) ||
      (bulk && (await rateLimited(actor, "bulk-send", "send")))
    ) {
      return { status: "error", operationId, message: rateLimitedMessage };
    }
    outcome = await sendEmail(
      { store: getAdminStore(), google, cipher, gmail: getGmailClient() },
      actor,
      parsed.data,
      new Date(),
    );
  } catch (error) {
    logFailure("Send", error);
    return {
      status: "error",
      operationId,
      message:
        "Something went wrong. Check the history below before sending again.",
    };
  }

  await audit(
    actor,
    "send",
    outcome.ok ? "success" : "failure",
    null,
    sendAuditDetail(operationId, outcome),
  );
  revalidatePath("/admin/compose");
  revalidatePath("/admin/history");
  if (!outcome.ok) {
    return {
      status: "error",
      operationId,
      message: describeSendRejection(outcome),
    };
  }

  const results = outcome.results.map((result) => ({
    email: result.email,
    status: result.status,
    message: describeRecipientResult(result),
  }));
  const sent = results.filter((result) => result.status === "SENT").length;
  const finished = results.every(
    (result) => result.status === "SENT" || result.status === "ALREADY_SENT",
  );
  if (finished) {
    return {
      status: "success",
      operationId: newOperationId(new Date()),
      message:
        sent === results.length
          ? `Sent ${sent} ${sent === 1 ? "email" : "emails"}.`
          : `Sent ${sent}; the rest were already sent earlier.`,
      results,
    };
  }
  return {
    status: "error",
    operationId,
    message: `Sent ${sent} of ${results.length}. Sending again retries only the recipients marked "Not sent".`,
    results,
  };
}

/**
 * Stores a schedule and registers its trigger; nothing is sent now. The
 * owner is always the signed-in actor.
 */
export async function createScheduleAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireUser();
  const parsed = validateSchedule(formData);
  if (!parsed.success) {
    return {
      status: "error",
      fieldErrors: parsed.errors,
      message: "Check the highlighted fields. Nothing was scheduled.",
    };
  }

  let outcome;
  try {
    if (await rateLimited(actor, "schedule-create", "schedule.create")) {
      return { status: "error", message: rateLimitedMessage };
    }
    outcome = await createSchedule(
      { store: getAdminStore(), triggers: getScheduleTriggers() },
      actor,
      parsed.data,
      new Date(),
    );
  } catch (error) {
    logFailure("Schedule", error);
    return {
      status: "error",
      message:
        "Something went wrong. Check the schedules below before trying again.",
    };
  }

  await audit(
    actor,
    "schedule.create",
    outcome.ok ? "success" : "failure",
    outcome.ok ? outcome.schedule.id : null,
    outcome.ok
      ? { type: outcome.schedule.type }
      : { type: parsed.data.type, reason: outcome.reason },
  );
  revalidatePath("/admin/schedules");
  if (!outcome.ok) {
    return { status: "error", message: describeScheduleRejection(outcome) };
  }
  return {
    status: "success",
    message: `Scheduled. First send: ${formatInZone(outcome.schedule.nextRunAt ?? outcome.schedule.startAt, outcome.schedule.timeZone)}.`,
  };
}

/** Cancels one of the actor's own schedules; anyone else's is not found. */
export async function cancelScheduleAction(formData: FormData) {
  const actor = await requireUser();
  try {
    const scheduleId = readField(formData, "scheduleId");
    if (await rateLimited(actor, "schedule-cancel", "schedule.cancel")) return;
    const outcome = await cancelSchedule(
      { store: getAdminStore(), triggers: getScheduleTriggers() },
      actor,
      scheduleId,
      new Date(),
    );
    await audit(
      actor,
      "schedule.cancel",
      outcome === "cancelled" ? "success" : "failure",
      scheduleId || null,
      { result: outcome },
    );
  } catch (error) {
    logFailure("Schedule cancellation", error);
  }
  revalidatePath("/admin/schedules");
}

const settingsFields = [
  "dailyTotalEmails",
  "dailyBulkRecipients",
  "maxBulkRecipientsPerOperation",
  "maxScheduledEmails",
  "maxRecurringSchedules",
  "maxFutureSchedulingWindowDays",
] as const;

/** OWNER only; the domain function refuses anyone else. */
export async function updateUserSettingsAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireUser();
  const values = textValues(formData, settingsFields);
  const parsed = validateSettings(formData);
  if (!parsed.success) {
    return { status: "error", fieldErrors: parsed.errors, values };
  }

  const userId = readField(formData, "userId");
  let outcome;
  try {
    if (await rateLimited(actor, "administration", "settings.update")) {
      return { status: "error", message: rateLimitedMessage, values };
    }
    outcome = await updateUserSettings(
      getAdminStore(),
      actor,
      userId,
      parsed.data,
      new Date(),
    );
  } catch (error) {
    logFailure("Settings update", error);
    return { ...unexpected, values };
  }

  await audit(
    actor,
    "settings.update",
    outcome === "updated"
      ? "success"
      : outcome === "forbidden"
        ? "denied"
        : "failure",
    userId || null,
    outcome === "updated" ? parsed.data : { result: outcome },
  );
  if (outcome !== "updated") {
    return {
      status: "error",
      message:
        outcome === "forbidden"
          ? "Only the owner can change sending settings."
          : "That user was not found.",
    };
  }
  revalidatePath("/admin/users");
  revalidatePath("/admin/settings");
  return { status: "success", message: "Settings saved." };
}

/*
 * Retry (M5). Takes only an operation ID (and, for an immediate send, the
 * message again); the retry module looks the operation up under the
 * signed-in user's ID and sends through `sendEmail`. The result returns to
 * the operation's page as a fixed `?retry=` code.
 */
const retryResult = (operationId: string, code: string) =>
  isWellFormedOperationId(operationId)
    ? `/admin/history/${operationId}?retry=${code}`
    : `/admin/history?retry=${code}`;

export async function retryOperationAction(formData: FormData) {
  const actor = await requireUser();
  const operationId = readField(formData, "operationId");
  const google = getGoogleOAuthClient();
  const cipher = getTokenCipher();

  let code = "unavailable";
  if (google && cipher) {
    let message: RetryMessage | null = null;
    let valid = true;
    if (formData.has("subject") || formData.has("body")) {
      const parsed = validateRetryMessage(formData);
      if (parsed.success) message = parsed.data;
      else valid = false;
    }
    if (!valid) {
      code = "invalid-message";
    } else {
      try {
        if (await rateLimited(actor, "retry", "send.retry")) {
          code = "rate-limited";
        } else {
          const outcome = await retryFailedSends(
            { store: getAdminStore(), google, cipher, gmail: getGmailClient() },
            actor,
            { operationId, message },
            new Date(),
          );
          code = retryCode(outcome);
          await audit(
            actor,
            "send.retry",
            outcome.ok ? "success" : "failure",
            null,
            retryAuditDetail(operationId, outcome),
          );
        }
      } catch (error) {
        logFailure("Retry", error);
        code = "failed";
      }
    }
  }
  revalidatePath("/admin/history");
  redirect(retryResult(operationId, code));
}
