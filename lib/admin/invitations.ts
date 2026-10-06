import { type StartedSession, startSession } from "@/lib/admin/auth";
import {
  countUsedSeats,
  effectiveInvitationStatus,
  type Invitation,
  invitationTtlMs,
  maxUsers,
  type PublicInvitation,
  type PublicUser,
  toPublicInvitation,
  toPublicUser,
  type User,
} from "@/lib/admin/model";
import { hashPassword } from "@/lib/admin/password";
import type { AdminStore, CreateInvitationResult } from "@/lib/admin/store";
import {
  generateToken,
  hashToken,
  isWellFormedToken,
} from "@/lib/admin/tokens";
import type { NewAccount } from "@/lib/admin/validation";

export function invitationPath(token: string) {
  return `/admin/invite/${token}`;
}

export type Capacity = {
  users: number;
  pendingInvitations: number;
  used: number;
  max: number;
};

export function getCapacity(
  users: readonly User[],
  invitations: readonly Invitation[],
  now: Date,
): Capacity {
  const used = countUsedSeats(users, invitations, now);
  return {
    users: users.length,
    pendingInvitations: used - users.length,
    used,
    max: maxUsers,
  };
}

export type CreateInvitationOutcome =
  | { ok: true; token: string; invitation: PublicInvitation }
  | {
      ok: false;
      reason: "forbidden" | Exclude<CreateInvitationResult, "created">;
    };

/**
 * OWNER only. The raw token is returned exactly once, to the OWNER who
 * created it, and only its hash is stored. Invitations always create USER
 * accounts; no role is taken from input.
 */
export async function createInvitation(
  store: AdminStore,
  actor: PublicUser,
  email: string,
  now: Date,
): Promise<CreateInvitationOutcome> {
  if (actor.role !== "OWNER") return { ok: false, reason: "forbidden" };

  const token = generateToken();
  const invitation: Invitation = {
    id: crypto.randomUUID(),
    email,
    role: "USER",
    status: "PENDING",
    tokenHash: hashToken(token),
    expiresAt: new Date(now.getTime() + invitationTtlMs).toISOString(),
    createdAt: now.toISOString(),
    acceptedAt: null,
    revokedAt: null,
    invitedBy: actor.id,
  };

  const result = await store.createInvitation(invitation, maxUsers, now);
  return result === "created"
    ? { ok: true, token, invitation: toPublicInvitation(invitation, now) }
    : { ok: false, reason: result };
}

export async function revokeInvitation(
  store: AdminStore,
  actor: PublicUser,
  invitationId: string,
  now: Date,
) {
  if (actor.role !== "OWNER") return false;
  return store.revokeInvitation(invitationId, now.toISOString());
}

/** The invitation a token opens, only while it can still be accepted. */
export async function findOpenInvitation(
  store: AdminStore,
  token: string,
  now: Date,
): Promise<Invitation | null> {
  if (!isWellFormedToken(token)) return null;
  const invitation = await store.getInvitationByTokenHash(hashToken(token));
  return invitation && effectiveInvitationStatus(invitation, now) === "PENDING"
    ? invitation
    : null;
}

export type AcceptInvitationOutcome =
  | ({ ok: true; user: PublicUser } & StartedSession)
  | { ok: false; reason: "unavailable" | "email-taken" };

/**
 * The invited person sets their own name and password. The account's email
 * and role come from the stored invitation, never from the form.
 */
export async function acceptInvitation(
  store: AdminStore,
  token: string,
  account: NewAccount,
  now: Date,
): Promise<AcceptInvitationOutcome> {
  const invitation = await findOpenInvitation(store, token, now);
  if (!invitation) return { ok: false, reason: "unavailable" };

  const at = now.toISOString();
  const user: User = {
    id: crypto.randomUUID(),
    email: invitation.email,
    name: account.name,
    passwordHash: await hashPassword(account.password),
    role: "USER",
    status: "ACTIVE",
    createdAt: at,
    updatedAt: at,
    lastLoginAt: at,
    sessionsValidAfter: null,
  };

  const result = await store.acceptInvitation(invitation.id, user, now);
  if (result !== "accepted") return { ok: false, reason: result };

  const session = await startSession(store, user.id, now);
  return { ok: true, user: toPublicUser(user), ...session };
}
