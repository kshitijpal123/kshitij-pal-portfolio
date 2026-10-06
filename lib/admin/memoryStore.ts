import {
  type AuditEvent,
  type Contact,
  countUsedSeats,
  type DailyUsage,
  effectiveInvitationStatus,
  type EmailTemplate,
  type GmailConnection,
  type Invitation,
  type OAuthState,
  type Schedule,
  type ScheduleCounts,
  type ScheduleRun,
  type SendRecord,
  type SenderIdentity,
  type Session,
  type User,
  type UserSettings,
} from "@/lib/admin/model";
import type {
  AdminStore,
  Page,
  PageRequest,
  ScheduleEnd,
} from "@/lib/admin/store";

/** Newest first by `key`, after an exclusive cursor, like a DynamoDB page. */
function pageOf<T>(
  items: T[],
  key: (item: T) => string,
  { after, limit }: PageRequest,
): Page<T> {
  const sorted = items
    .filter((item) => after === null || key(item) < after)
    .sort((a, b) => key(b).localeCompare(key(a)));
  const slice = sorted.slice(0, limit);
  return {
    items: slice,
    last:
      sorted.length > limit && slice.length > 0
        ? key(slice[slice.length - 1])
        : null,
  };
}

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
  const settings = new Map<string, UserSettings>();
  /** Keyed by `<userId> <id>`, like the DynamoDB per-user partitions. */
  const contacts = new Map<string, Contact>();
  const templates = new Map<string, EmailTemplate>();
  const sends = new Map<string, SendRecord>();
  const usage = new Map<string, DailyUsage>();
  const schedules = new Map<string, Schedule>();
  const scheduleCounts = new Map<string, ScheduleCounts>();
  /** Keyed by `<userId> <scheduleId>#<occurrence>`. */
  const runs = new Map<string, ScheduleRun>();
  /** Keyed by `<key>#<window start>`. */
  const rateCounts = new Map<string, number>();
  const auditEvents: AuditEvent[] = [];

  const copy = <T>(value: T): T => structuredClone(value);
  const owned = (userId: string, id: string) => `${userId} ${id}`;
  const contactsOf = (userId: string) =>
    [...contacts.values()].filter((contact) => contact.userId === userId);
  const emailTaken = (userId: string, email: string, exceptId?: string) =>
    contactsOf(userId).some(
      (contact) => contact.email === email && contact.id !== exceptId,
    );
  const usageOf = (userId: string, day: string) =>
    usage.get(owned(userId, day)) ?? { total: 0, bulk: 0 };
  const findUserByEmail = (email: string) =>
    [...users.values()].find((user) => user.email === email);
  const countsOf = (userId: string) =>
    scheduleCounts.get(userId) ?? { active: 0, recurring: 0 };
  const runKey = (userId: string, scheduleId: string, occurrence: string) =>
    owned(userId, `${scheduleId}#${occurrence}`);

  /** Applies a final state to a stored ACTIVE schedule and releases it. */
  function applyEnd(stored: Schedule, end: ScheduleEnd) {
    stored.status = end.status;
    stored.updatedAt = end.at;
    stored.nextRunAt = null;
    stored.body = "";
    stored.failureCode = end.failureCode;
    if (end.status === "CANCELLED") stored.cancelledAt = end.at;
    else stored.completedAt = end.at;
    const counts = countsOf(stored.userId);
    scheduleCounts.set(stored.userId, {
      active: counts.active - 1,
      recurring: counts.recurring - (stored.type === "RECURRING" ? 1 : 0),
    });
  }

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

    async getUserSettings(userId) {
      const stored = settings.get(userId);
      return stored ? copy(stored) : null;
    },

    async saveUserSettings(value) {
      settings.set(value.userId, copy(value));
    },

    async listContacts(userId) {
      return contactsOf(userId).map(copy);
    },

    async getContact(userId, contactId) {
      const contact = contacts.get(owned(userId, contactId));
      return contact ? copy(contact) : null;
    },

    async createContact(contact) {
      const key = owned(contact.userId, contact.id);
      if (contacts.has(key) || emailTaken(contact.userId, contact.email)) {
        return "duplicate";
      }
      contacts.set(key, copy(contact));
      return "saved";
    },

    async updateContact(contact, previousEmail) {
      const key = owned(contact.userId, contact.id);
      const existing = contacts.get(key);
      if (!existing || existing.email !== previousEmail) return "not-found";
      if (emailTaken(contact.userId, contact.email, contact.id)) {
        return "duplicate";
      }
      contacts.set(key, copy(contact));
      return "saved";
    },

    async deleteContact(userId, contactId, email) {
      const key = owned(userId, contactId);
      if (contacts.get(key)?.email !== email) return false;
      contacts.delete(key);
      return true;
    },

    async listTemplates(userId) {
      return [...templates.values()]
        .filter((template) => template.userId === userId)
        .map(copy);
    },

    async getTemplate(userId, templateId) {
      const template = templates.get(owned(userId, templateId));
      return template ? copy(template) : null;
    },

    async createTemplate(template) {
      templates.set(owned(template.userId, template.id), copy(template));
    },

    async updateTemplate(template) {
      const key = owned(template.userId, template.id);
      if (!templates.has(key)) return false;
      templates.set(key, copy(template));
      return true;
    },

    async deleteTemplate(userId, templateId) {
      return templates.delete(owned(userId, templateId));
    },

    async getDailyUsage(userId, day) {
      return copy(usageOf(userId, day));
    },

    async reserveSends({ userId, day, bulk, limits, create, retry }) {
      const count = create.length + retry.length;
      const current = usageOf(userId, day);
      if (
        current.total + count > limits.dailyTotalEmails ||
        (bulk && current.bulk + count > limits.dailyBulkRecipients)
      ) {
        return "limit";
      }
      const conflict =
        create.some((record) => sends.has(owned(userId, record.id))) ||
        retry.some(
          (record) => sends.get(owned(userId, record.id))?.status !== "FAILED",
        );
      if (conflict) return "conflict";

      usage.set(owned(userId, day), {
        total: current.total + count,
        bulk: current.bulk + (bulk ? count : 0),
      });
      for (const record of [...create, ...retry]) {
        sends.set(owned(userId, record.id), copy(record));
      }
      return "reserved";
    },

    async finishSend(record, completion) {
      const key = owned(record.userId, record.id);
      const stored = sends.get(key);
      if (!stored || stored.status !== "RESERVED") return false;
      stored.status = completion.status;
      stored.updatedAt = completion.at;
      stored.completedAt = completion.at;
      if (completion.status === "SENT") {
        stored.gmailMessageId = completion.gmailMessageId;
      } else {
        stored.failureCode = completion.failureCode;
      }
      if (completion.status === "FAILED") {
        const current = usageOf(stored.userId, stored.quotaDay);
        usage.set(owned(stored.userId, stored.quotaDay), {
          total: current.total - 1,
          bulk: current.bulk - (stored.bulk ? 1 : 0),
        });
      }
      return true;
    },

    async listSendRecordsForOperation(userId, operationId) {
      return [...sends.values()]
        .filter(
          (record) =>
            record.userId === userId && record.operationId === operationId,
        )
        .map(copy);
    },

    async listRecentSendRecords(userId, limit) {
      return [...sends.values()]
        .filter((record) => record.userId === userId)
        .sort((a, b) => b.id.localeCompare(a.id))
        .slice(0, limit)
        .map(copy);
    },

    async listSendRecordsPage(userId, { lower, upper }, page) {
      const inRange = [...sends.values()].filter(
        (record) =>
          record.userId === userId && record.id >= lower && record.id <= upper,
      );
      const result = pageOf(inRange, (record) => record.id, page);
      return { items: result.items.map(copy), last: result.last };
    },

    async consumeRateLimit(key, limit, windowMs, now) {
      const windowStart = Math.floor(now.getTime() / windowMs) * windowMs;
      const slot = `${key}#${windowStart}`;
      const count = rateCounts.get(slot) ?? 0;
      if (count >= limit) return false;
      rateCounts.set(slot, count + 1);
      return true;
    },

    async appendAuditEvent(event) {
      auditEvents.push(copy(event));
    },

    async listAuditEvents(subject, page) {
      const result = pageOf(
        auditEvents.filter((event) => event.subject === subject),
        (event) => event.id,
        page,
      );
      return { items: result.items.map(copy), last: result.last };
    },

    async listSchedules(userId) {
      return [...schedules.values()]
        .filter((schedule) => schedule.userId === userId)
        .map(copy);
    },

    async getSchedule(userId, scheduleId) {
      const schedule = schedules.get(owned(userId, scheduleId));
      return schedule ? copy(schedule) : null;
    },

    async findSchedule(scheduleId) {
      const schedule = [...schedules.values()].find(
        (candidate) => candidate.id === scheduleId,
      );
      return schedule ? copy(schedule) : null;
    },

    async getScheduleCounts(userId) {
      return copy(countsOf(userId));
    },

    async createSchedule(schedule, limits) {
      const counts = countsOf(schedule.userId);
      const recurring = schedule.type === "RECURRING";
      if (
        counts.active + 1 > limits.maxScheduledEmails ||
        (recurring && counts.recurring + 1 > limits.maxRecurringSchedules)
      ) {
        return "limit";
      }
      scheduleCounts.set(schedule.userId, {
        active: counts.active + 1,
        recurring: counts.recurring + (recurring ? 1 : 0),
      });
      schedules.set(owned(schedule.userId, schedule.id), copy(schedule));
      return "created";
    },

    async endSchedule(schedule, end) {
      const stored = schedules.get(owned(schedule.userId, schedule.id));
      if (!stored || stored.status !== "ACTIVE") return false;
      applyEnd(stored, end);
      return true;
    },

    async claimScheduleRun(run) {
      const key = runKey(run.userId, run.scheduleId, run.occurrence);
      if (runs.has(key)) return "duplicate";
      const schedule = schedules.get(owned(run.userId, run.scheduleId));
      if (schedule?.status !== "ACTIVE") return "not-active";
      runs.set(key, copy(run));
      return "claimed";
    },

    async getScheduleRun(userId, scheduleId, occurrence) {
      const run = runs.get(runKey(userId, scheduleId, occurrence));
      return run ? copy(run) : null;
    },

    async finishScheduleRun(_schedule, run, completion, advance) {
      const stored = runs.get(
        runKey(run.userId, run.scheduleId, run.occurrence),
      );
      if (!stored || stored.status !== "RESERVED") return;
      Object.assign(stored, {
        status: completion.status,
        failureCode: completion.failureCode,
        sent: completion.sent,
        failed: completion.failed,
        uncertain: completion.uncertain,
        completedAt: completion.at,
      });
      const schedule = schedules.get(owned(run.userId, run.scheduleId));
      if (!schedule) return;
      schedule.lastRunAt = completion.at;
      schedule.lastRunStatus = completion.status;
      schedule.lastRunFailure = completion.failureCode;
      schedule.runCount += 1;
      schedule.updatedAt = completion.at;
      if (schedule.status !== "ACTIVE") return;
      if (advance.kind === "next") schedule.nextRunAt = advance.nextRunAt;
      else applyEnd(schedule, advance.end);
    },
  };
}
