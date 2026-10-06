import type {
  PublicUser,
  SenderIdentity,
  SenderIdentityStatus,
} from "@/lib/admin/model";
import type { AdminStore, SenderReview } from "@/lib/admin/store";

const byRequestedAtDesc = (a: SenderIdentity, b: SenderIdentity) =>
  b.requestedAt.localeCompare(a.requestedAt);

/**
 * Any signed-in user may ask to send as an address. The identity always
 * belongs to the requesting user. `false` when the address is already
 * requested or approved by anyone.
 */
export async function requestSenderIdentity(
  store: AdminStore,
  actor: PublicUser,
  email: string,
  now: Date,
) {
  return store.createSenderIdentity({
    id: crypto.randomUUID(),
    userId: actor.id,
    email,
    provider: "GMAIL",
    status: "REQUESTED",
    requestedAt: now.toISOString(),
    reviewedAt: null,
    reviewedBy: null,
    rejectionReason: null,
  });
}

/** The actor's own identities, newest first. */
export async function listOwnSenderIdentities(
  store: AdminStore,
  actor: PublicUser,
) {
  return (await store.listSenderIdentitiesForUser(actor.id)).sort(
    byRequestedAtDesc,
  );
}

export type SenderIdentityForReview = SenderIdentity & {
  requester: Pick<PublicUser, "name" | "email"> | null;
};

/** OWNER only; `null` for anyone else. */
export async function listSenderIdentitiesForReview(
  store: AdminStore,
  actor: PublicUser,
): Promise<SenderIdentityForReview[] | null> {
  if (actor.role !== "OWNER") return null;
  const [identities, users] = await Promise.all([
    store.listSenderIdentities(),
    store.listUsers(),
  ]);
  const requesters = new Map(
    users.map((user) => [user.id, { name: user.name, email: user.email }]),
  );
  return identities.sort(byRequestedAtDesc).map((identity) => ({
    ...identity,
    requester: requesters.get(identity.userId) ?? null,
  }));
}

export type SenderDecision = "approve" | "reject" | "disable";

const transitions: Record<
  SenderDecision,
  { from: readonly SenderIdentityStatus[]; to: SenderReview["to"] }
> = {
  approve: { from: ["REQUESTED"], to: "APPROVED" },
  reject: { from: ["REQUESTED"], to: "REJECTED" },
  disable: { from: ["APPROVED"], to: "DISABLED" },
};

/** OWNER only. A rejection reason is kept only for rejections. */
export async function reviewSenderIdentity(
  store: AdminStore,
  actor: PublicUser,
  identityId: string,
  decision: SenderDecision,
  rejectionReason: string | null,
  now: Date,
) {
  if (actor.role !== "OWNER") return false;
  return store.reviewSenderIdentity(identityId, {
    ...transitions[decision],
    reviewedBy: actor.id,
    reviewedAt: now.toISOString(),
    rejectionReason: decision === "reject" ? rejectionReason : null,
  });
}

/**
 * The authorization check future sending must pass: the address is APPROVED
 * for this user. It says nothing about Gmail; Google OAuth is a separate,
 * later step (M2).
 */
export async function isApprovedSender(
  store: AdminStore,
  userId: string,
  email: string,
) {
  const identities = await store.listSenderIdentitiesForUser(userId);
  return identities.some(
    (identity) =>
      identity.email === email &&
      identity.userId === userId &&
      identity.status === "APPROVED",
  );
}
