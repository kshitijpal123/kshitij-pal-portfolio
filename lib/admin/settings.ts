import type { DailyUsage, PublicUser, UserSettings } from "@/lib/admin/model";
import type { AdminStore } from "@/lib/admin/store";
import type { SettingsInput } from "@/lib/admin/validation";

/**
 * The console's own safety limits and switches for a user the OWNER has not
 * configured. They are application limits, independent of Google's Gmail
 * sending quotas, which Google enforces separately.
 */
export const defaultUserSettings: Readonly<SettingsInput> = {
  sendingEnabled: true,
  bulkSendingEnabled: true,
  templatesEnabled: true,
  contactsEnabled: true,
  schedulingEnabled: true,
  recurringEnabled: true,
  dailyTotalEmails: 50,
  dailyBulkRecipients: 25,
  maxBulkRecipientsPerOperation: 10,
  maxScheduledEmails: 20,
  maxRecurringSchedules: 5,
  maxFutureSchedulingWindowDays: 30,
};

/** Daily limits reset at 00:00 UTC. */
export function quotaDay(now: Date) {
  return now.toISOString().slice(0, 10);
}

/** The user's settings, with defaults for anything never configured. */
export async function getUserSettings(
  store: AdminStore,
  userId: string,
): Promise<UserSettings> {
  const stored = await store.getUserSettings(userId);
  return {
    userId,
    updatedAt: null,
    updatedBy: null,
    ...defaultUserSettings,
    ...stored,
  };
}

export type SendingAllowance = {
  settings: UserSettings;
  usage: DailyUsage;
};

/** The actor's own settings and today's usage, for display. */
export async function getOwnSendingAllowance(
  store: AdminStore,
  actor: PublicUser,
  now: Date,
): Promise<SendingAllowance> {
  const [settings, usage] = await Promise.all([
    getUserSettings(store, actor.id),
    store.getDailyUsage(actor.id, quotaDay(now)),
  ]);
  return { settings, usage };
}

/** OWNER only; `null` for anyone else. Every user's effective settings. */
export async function listUserSettings(
  store: AdminStore,
  actor: PublicUser,
): Promise<Map<string, UserSettings> | null> {
  if (actor.role !== "OWNER") return null;
  const users = await store.listUsers();
  const entries = await Promise.all(
    users.map(
      async (user) => [user.id, await getUserSettings(store, user.id)] as const,
    ),
  );
  return new Map(entries);
}

export type UpdateSettingsResult = "updated" | "forbidden" | "not-found";

/** OWNER only, for any account including the OWNER's own. */
export async function updateUserSettings(
  store: AdminStore,
  actor: PublicUser,
  userId: string,
  input: SettingsInput,
  now: Date,
): Promise<UpdateSettingsResult> {
  if (actor.role !== "OWNER") return "forbidden";
  if (!userId || !(await store.getUserById(userId))) return "not-found";
  await store.saveUserSettings({
    userId,
    sendingEnabled: input.sendingEnabled,
    bulkSendingEnabled: input.bulkSendingEnabled,
    templatesEnabled: input.templatesEnabled,
    contactsEnabled: input.contactsEnabled,
    schedulingEnabled: input.schedulingEnabled,
    recurringEnabled: input.recurringEnabled,
    dailyTotalEmails: input.dailyTotalEmails,
    dailyBulkRecipients: input.dailyBulkRecipients,
    maxBulkRecipientsPerOperation: input.maxBulkRecipientsPerOperation,
    maxScheduledEmails: input.maxScheduledEmails,
    maxRecurringSchedules: input.maxRecurringSchedules,
    maxFutureSchedulingWindowDays: input.maxFutureSchedulingWindowDays,
    updatedAt: now.toISOString(),
    updatedBy: actor.id,
  });
  return "updated";
}
