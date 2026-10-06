import {
  countUsedSeats,
  effectiveInvitationStatus,
  type GmailConnection,
  type Invitation,
  type OAuthState,
  type SenderIdentity,
  type Session,
  type User,
} from "@/lib/admin/model";
import type { AdminStore } from "@/lib/admin/store";

/** Identities that hold their address, so no one else can request it. */
const claimingStatuses = new Set(["REQUESTED", "APPROVED"]);

/**
 * An in-process store for tests and local development only. It is lost on
 * restart and not shared between processes, so it is never used in
 * production (see `getAdminStore`). Each method runs synchronously between
 * awaits, which makes it atomic.
 */
export function createMemoryStore(): AdminStore {
  const users = new Map<string, User>();
  const invitations = new Map<string, Invitation>();
  const sessions = new Map<string, Session>();
  const failures = new Map<string, { count: number; windowStart: number }>();
  const senders = new Map<string, SenderIdentity>();
  const oauthStates = new Map<string, OAuthState>();
  const gmailConnections = new Map<string, GmailConnection>();

  const copy = <T>(value: T): T => structuredClone(value);
  const findUserByEmail = (email: string) =>
    [...users.values()].find((user) => user.email === email);

  return {
    async ownerExists() {
      return [...users.values()].some((user) => user.role === "OWNER");
    },

    async createOwner(user) {
      if (
        [...users.values()].some((existing) => existing.role === "OWNER") ||
        findUserByEmail(user.email)
      ) {
        return "owner-exists";
      }
      users.set(user.id, copy(user));
      return "created";
    },

    async getUserById(id) {
      const user = users.get(id);
      return user ? copy(user) : null;
    },

    async getUserByEmail(email) {
      const user = findUserByEmail(email);
      return user ? copy(user) : null;
    },

    async listUsers() {
      return [...users.values()].map(copy);
    },

    async recordLogin(userId, at) {
      const user = users.get(userId);
      if (user) user.lastLoginAt = at;
    },

    async setUserStatus(userId, status, at) {
      const user = users.get(userId);
      if (!user || user.role !== "USER") return false;
      user.status = status;
      user.updatedAt = at;
      if (status === "DISABLED") user.sessionsValidAfter = at;
      return true;
    },

    async listInvitations() {
      return [...invitations.values()].map(copy);
    },

    async getInvitationByTokenHash(tokenHash) {
      const invitation = [...invitations.values()].find(
        (candidate) => candidate.tokenHash === tokenHash,
      );
      return invitation ? copy(invitation) : null;
    },

    async createInvitation(invitation, maxSeats, now) {
      if (findUserByEmail(invitation.email)) return "already-user";
      const all = [...invitations.values()];
      if (
        all.some(
          (existing) =>
            existing.email === invitation.email &&
            effectiveInvitationStatus(existing, now) === "PENDING",
        )
      ) {
        return "already-invited";
      }
      if (countUsedSeats([...users.values()], all, now) >= maxSeats) {
        return "capacity-full";
      }
      invitations.set(invitation.id, copy(invitation));
      return "created";
    },

    async acceptInvitation(invitationId, user, now) {
      const invitation = invitations.get(invitationId);
      if (
        !invitation ||
        effectiveInvitationStatus(invitation, now) !== "PENDING"
      ) {
        return "unavailable";
      }
      if (findUserByEmail(user.email)) return "email-taken";
      invitation.status = "ACCEPTED";
      invitation.acceptedAt = now.toISOString();
      users.set(user.id, copy(user));
      return "accepted";
    },

    async revokeInvitation(invitationId, at) {
      const invitation = invitations.get(invitationId);
      if (!invitation || invitation.status !== "PENDING") return false;
      invitation.status = "REVOKED";
      invitation.revokedAt = at;
      return true;
    },

    async createSession(session) {
      sessions.set(session.tokenHash, copy(session));
    },

    async getSession(tokenHash) {
      const session = sessions.get(tokenHash);
      return session ? copy(session) : null;
    },

    async deleteSession(tokenHash) {
      sessions.delete(tokenHash);
    },

    async getFailedAttempts(key, now, windowMs) {
      const entry = failures.get(key);
      return entry && entry.windowStart > now.getTime() - windowMs
        ? entry.count
        : 0;
    },

    async recordFailedAttempt(key, now, windowMs) {
      const entry = failures.get(key);
      if (!entry || entry.windowStart <= now.getTime() - windowMs) {
        failures.set(key, { count: 1, windowStart: now.getTime() });
        return 1;
      }
      entry.count += 1;
      return entry.count;
    },

    async clearFailedAttempts(key) {
      failures.delete(key);
    },

    async createSenderIdentity(identity) {
      const claimed = [...senders.values()].some(
        (existing) =>
          existing.email === identity.email &&
          claimingStatuses.has(existing.status),
      );
      if (claimed) return false;
      senders.set(identity.id, copy(identity));
      return true;
    },

    async getSenderIdentity(id) {
      const identity = senders.get(id);
      return identity ? copy(identity) : null;
    },

    async listSenderIdentities() {
      return [...senders.values()].map(copy);
    },

    async listSenderIdentitiesForUser(userId) {
      return [...senders.values()]
        .filter((identity) => identity.userId === userId)
        .map(copy);
    },

    async reviewSenderIdentity(id, review) {
      const identity = senders.get(id);
      if (!identity || !review.from.includes(identity.status)) return false;
      identity.status = review.to;
      identity.reviewedAt = review.reviewedAt;
      identity.reviewedBy = review.reviewedBy;
      identity.rejectionReason = review.rejectionReason;
      return true;
    },

    async createOAuthState(state) {
      oauthStates.set(state.stateHash, copy(state));
    },

    async takeOAuthState(stateHash) {
      const state = oauthStates.get(stateHash);
      oauthStates.delete(stateHash);
      return state ? copy(state) : null;
    },

    async getGmailConnection(senderIdentityId) {
      const connection = gmailConnections.get(senderIdentityId);
      return connection ? copy(connection) : null;
    },

    async listGmailConnectionsForUser(userId) {
      return [...gmailConnections.values()]
        .filter((connection) => connection.userId === userId)
        .map(copy);
    },

    async saveGmailConnection(connection) {
      gmailConnections.set(connection.senderIdentityId, copy(connection));
    },
  };
}
