"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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
import { maxUsers } from "@/lib/admin/model";
import { formatInZone } from "@/lib/admin/recurrence";
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
  readSessionCookie,
  requireUser,
  setSessionCookie,
} from "@/lib/admin/session";
import {
  describeRecipientResult,
  describeSendRejection,
  newOperationId,
  sendEmail,
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
  normalizeEmail,
  readField,
  validateContact,
  validateEmailField,
  validateLogin,
  validateNewAccount,
  validateOwnerSetup,
  validateRejectionReason,
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
    await endSession(getAdminStore(), await readSessionCookie());
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
  await revokeInvitation(
    getAdminStore(),
    actor,
    readField(formData, "invitationId"),
    new Date(),
  );
  revalidatePath("/admin/users");
}

export async function setUserStatusAction(formData: FormData) {
  const actor = await requireUser();
  const status = readField(formData, "status");
  if (status !== "ACTIVE" && status !== "DISABLED") return;
  await setUserStatus(
    getAdminStore(),
    actor,
    readField(formData, "userId"),
    status,
    new Date(),
  );
  revalidatePath("/admin/users");
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
  await reviewSenderIdentity(
    getAdminStore(),
    actor,
    readField(formData, "identityId"),
    decision as SenderDecision,
    reason.reason,
    new Date(),
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
      const outcome = await startGmailConnection(
        { store: getAdminStore(), google },
        actor,
        sessionToken,
        readField(formData, "identityId"),
        new Date(),
      );
      destination = outcome.ok
        ? outcome.authorizationUrl
        : gmailResult(outcome.reason);
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
      outcome = await verifyGmailConnection(
        { store: getAdminStore(), google, cipher },
        actor,
        readField(formData, "identityId"),
        new Date(),
      );
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
    outcome = await disconnectGmail(
      {
        store: getAdminStore(),
        google: getGoogleOAuthClient(),
        cipher: getTokenCipher(),
      },
      actor,
      readField(formData, "identityId"),
      new Date(),
    );
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

  revalidatePath("/admin/compose");
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
    await cancelSchedule(
      { store: getAdminStore(), triggers: getScheduleTriggers() },
      actor,
      readField(formData, "scheduleId"),
      new Date(),
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

  let outcome;
  try {
    outcome = await updateUserSettings(
      getAdminStore(),
      actor,
      readField(formData, "userId"),
      parsed.data,
      new Date(),
    );
  } catch (error) {
    logFailure("Settings update", error);
    return { ...unexpected, values };
  }

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
  return { status: "success", message: "Settings saved." };
}
