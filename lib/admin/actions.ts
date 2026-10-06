"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  bootstrapOwner,
  endSession,
  getBootstrapToken,
  login,
} from "@/lib/admin/auth";
import type { FormState } from "@/lib/admin/formState";
import { getAdminStore } from "@/lib/admin/getAdminStore";
import {
  acceptInvitation,
  createInvitation,
  invitationPath,
  revokeInvitation,
} from "@/lib/admin/invitations";
import { maxUsers } from "@/lib/admin/model";
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
import { setUserStatus } from "@/lib/admin/users";
import {
  normalizeEmail,
  readField,
  validateEmailField,
  validateLogin,
  validateNewAccount,
  validateOwnerSetup,
  validateRejectionReason,
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
