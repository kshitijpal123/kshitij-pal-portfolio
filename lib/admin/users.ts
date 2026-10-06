import { getCapacity, type Capacity } from "@/lib/admin/invitations";
import {
  type PublicInvitation,
  type PublicUser,
  toPublicInvitation,
  toPublicUser,
  type UserStatus,
} from "@/lib/admin/model";
import type { AdminStore } from "@/lib/admin/store";

export type UserAdministration = {
  users: PublicUser[];
  invitations: PublicInvitation[];
  capacity: Capacity;
};

const byCreatedAt = (a: { createdAt: string }, b: { createdAt: string }) =>
  a.createdAt.localeCompare(b.createdAt);

/** OWNER only; `null` for anyone else. Password hashes never leave here. */
export async function getUserAdministration(
  store: AdminStore,
  actor: PublicUser,
  now: Date,
): Promise<UserAdministration | null> {
  if (actor.role !== "OWNER") return null;
  const [users, invitations] = await Promise.all([
    store.listUsers(),
    store.listInvitations(),
  ]);
  return {
    users: users.sort(byCreatedAt).map(toPublicUser),
    invitations: invitations
      .sort(byCreatedAt)
      .reverse()
      .map((invitation) => toPublicInvitation(invitation, now)),
    capacity: getCapacity(users, invitations, now),
  };
}

/**
 * OWNER only, and only for USER accounts: the OWNER can never be disabled.
 * Disabling also rejects the user's existing sessions.
 */
export async function setUserStatus(
  store: AdminStore,
  actor: PublicUser,
  userId: string,
  status: UserStatus,
  now: Date,
) {
  if (actor.role !== "OWNER" || userId === actor.id) return false;
  return store.setUserStatus(userId, status, now.toISOString());
}
