import { bootstrapOwner } from "@/lib/admin/auth";
import { acceptInvitation, createInvitation } from "@/lib/admin/invitations";
import { createMemoryStore } from "@/lib/admin/memoryStore";
import type { PublicUser } from "@/lib/admin/model";
import type { AdminStore } from "@/lib/admin/store";

export const setupToken = "test-setup-token-0123456789abcdefghijklmnop";
export const ownerPassword = "owner passphrase 1";
export const userPassword = "user passphrase 22";

export const now = new Date("2026-10-06T09:00:00.000Z");

export function later(ms: number, from: Date = now) {
  return new Date(from.getTime() + ms);
}

export async function seedOwner(
  store: AdminStore = createMemoryStore(),
  email = "owner@example.com",
) {
  const result = await bootstrapOwner(
    store,
    { email, name: "Owner", password: ownerPassword, setupToken },
    setupToken,
    now,
  );
  if (!result.ok) throw new Error(`Owner seed failed: ${result.reason}`);
  return { store, owner: result.user, ownerToken: result.token };
}

/** Invites and accepts a USER through the real services. */
export async function seedUser(
  store: AdminStore,
  owner: PublicUser,
  email: string,
  name = email.split("@")[0],
) {
  const invitation = await createInvitation(store, owner, email, now);
  if (!invitation.ok) throw new Error(`Invite failed: ${invitation.reason}`);
  const accepted = await acceptInvitation(
    store,
    invitation.token,
    { name, password: userPassword },
    now,
  );
  if (!accepted.ok) throw new Error(`Accept failed: ${accepted.reason}`);
  return { user: accepted.user, token: accepted.token };
}
