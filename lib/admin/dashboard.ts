import {
  type GmailAccount,
  listGmailAccounts,
} from "@/lib/admin/gmailConnections";
import type { Capacity } from "@/lib/admin/invitations";
import type {
  DailyUsage,
  PublicUser,
  Schedule,
  ScheduleCounts,
  SendRecord,
  UserSettings,
} from "@/lib/admin/model";
import { effectiveScheduleStatus } from "@/lib/admin/schedules";
import { listOwnSenderIdentities } from "@/lib/admin/senderIdentities";
import { getUserSettings, quotaDay } from "@/lib/admin/settings";
import type { AdminStore } from "@/lib/admin/store";
import { getUserAdministration } from "@/lib/admin/users";

/*
 * The console's overview. A user's dashboard is built only from their own
 * partitions. The OWNER additionally sees account-level numbers for every
 * user (status, settings, today's counters, schedule counts) and never any
 * other user's contacts, templates, recipients, subjects, or bodies.
 */

const recentSize = 5;
const attentionWindow = 50;
const attentionSize = 5;
/** A RESERVED record older than this did not finish (the request died). */
const staleReservationMs = 15 * 60_000;
const recentFailureMs = 7 * 24 * 60 * 60_000;

export type Dashboard = {
  settings: UserSettings;
  usage: DailyUsage;
  remaining: DailyUsage;
  gmailAccounts: GmailAccount[];
  senders: { approved: number; requested: number };
  schedules: ScheduleCounts;
  recent: SendRecord[];
  attention: {
    sends: SendRecord[];
    reconnect: GmailAccount[];
    schedules: Schedule[];
  };
};

function needsAttention(record: SendRecord, now: Date) {
  return (
    record.status === "FAILED" ||
    record.status === "UNCERTAIN" ||
    (record.status === "RESERVED" &&
      Date.parse(record.updatedAt) + staleReservationMs < now.getTime())
  );
}

function scheduleNeedsAttention(schedule: Schedule, now: Date) {
  const status = effectiveScheduleStatus(schedule, now);
  if (status === "OVERDUE") return true;
  if (
    status === "ACTIVE" &&
    (schedule.lastRunStatus === "FAILED" ||
      schedule.lastRunStatus === "UNCERTAIN")
  ) {
    return true;
  }
  return (
    status === "FAILED" &&
    Date.parse(schedule.updatedAt) + recentFailureMs > now.getTime()
  );
}

export async function getDashboard(
  store: AdminStore,
  actor: PublicUser,
  now: Date,
): Promise<Dashboard> {
  const [
    settings,
    usage,
    gmailAccounts,
    identities,
    counts,
    records,
    schedules,
  ] = await Promise.all([
    getUserSettings(store, actor.id),
    store.getDailyUsage(actor.id, quotaDay(now)),
    listGmailAccounts(store, actor),
    listOwnSenderIdentities(store, actor),
    store.getScheduleCounts(actor.id),
    store.listRecentSendRecords(actor.id, attentionWindow),
    store.listSchedules(actor.id),
  ]);
  const own = records.filter((record) => record.userId === actor.id);
  return {
    settings,
    usage,
    remaining: {
      total: Math.max(0, settings.dailyTotalEmails - usage.total),
      bulk: Math.max(0, settings.dailyBulkRecipients - usage.bulk),
    },
    gmailAccounts,
    senders: {
      approved: identities.filter((identity) => identity.status === "APPROVED")
        .length,
      requested: identities.filter(
        (identity) => identity.status === "REQUESTED",
      ).length,
    },
    schedules: counts,
    recent: own.slice(0, recentSize),
    attention: {
      sends: own
        .filter((record) => needsAttention(record, now))
        .slice(0, attentionSize),
      reconnect: gmailAccounts.filter(
        (account) =>
          account.identity.status === "APPROVED" &&
          account.connection?.status === "REAUTH_REQUIRED",
      ),
      schedules: schedules
        .filter(
          (schedule) =>
            schedule.userId === actor.id &&
            scheduleNeedsAttention(schedule, now),
        )
        .slice(0, attentionSize),
    },
  };
}

export type AccountOverview = {
  user: PublicUser;
  settings: UserSettings;
  usage: DailyUsage;
  schedules: ScheduleCounts;
};

export type OwnerDashboard = {
  capacity: Capacity;
  active: number;
  disabled: number;
  pendingSenderRequests: number;
  accounts: AccountOverview[];
};

/** OWNER only; `null` for anyone else. Counters and settings, no content. */
export async function getOwnerDashboard(
  store: AdminStore,
  actor: PublicUser,
  now: Date,
): Promise<OwnerDashboard | null> {
  if (actor.role !== "OWNER") return null;
  const [administration, identities] = await Promise.all([
    getUserAdministration(store, actor, now),
    store.listSenderIdentities(),
  ]);
  if (!administration) return null;
  const day = quotaDay(now);
  const accounts = await Promise.all(
    administration.users.map(async (user) => {
      const [settings, usage, schedules] = await Promise.all([
        getUserSettings(store, user.id),
        store.getDailyUsage(user.id, day),
        store.getScheduleCounts(user.id),
      ]);
      return { user, settings, usage, schedules };
    }),
  );
  return {
    capacity: administration.capacity,
    active: administration.users.filter((user) => user.status === "ACTIVE")
      .length,
    disabled: administration.users.filter((user) => user.status === "DISABLED")
      .length,
    pendingSenderRequests: identities.filter(
      (identity) => identity.status === "REQUESTED",
    ).length,
    accounts,
  };
}
