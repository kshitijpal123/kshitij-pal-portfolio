// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  defaultUserSettings,
  getOwnSendingAllowance,
  getUserSettings,
  listUserSettings,
  quotaDay,
  updateUserSettings,
} from "@/lib/admin/settings";
import { validateSettings } from "@/lib/admin/validation";
import { now, seedOwner, seedUser } from "@/tests/helpers/admin";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.append(key, value);
  return data;
}

const custom = {
  ...defaultUserSettings,
  bulkSendingEnabled: false,
  dailyTotalEmails: 5,
};

describe("user settings", () => {
  it("uses the documented defaults until the OWNER configures a user", async () => {
    const { store, owner } = await seedOwner();
    const { user } = await seedUser(store, owner, "friend@example.com");
    expect(defaultUserSettings).toEqual({
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
    });
    expect(await getUserSettings(store, user.id)).toEqual({
      userId: user.id,
      ...defaultUserSettings,
      updatedAt: null,
      updatedBy: null,
    });
  });

  it("lets only the OWNER change settings, for any existing account", async () => {
    const { store, owner } = await seedOwner();
    const { user } = await seedUser(store, owner, "friend@example.com");

    expect(await updateUserSettings(store, user, user.id, custom, now)).toBe(
      "forbidden",
    );
    expect(await updateUserSettings(store, user, owner.id, custom, now)).toBe(
      "forbidden",
    );
    expect(await getUserSettings(store, user.id)).toMatchObject(
      defaultUserSettings,
    );

    expect(await updateUserSettings(store, owner, "missing", custom, now)).toBe(
      "not-found",
    );
    expect(await updateUserSettings(store, owner, user.id, custom, now)).toBe(
      "updated",
    );
    expect(await getUserSettings(store, user.id)).toEqual({
      userId: user.id,
      ...custom,
      updatedAt: now.toISOString(),
      updatedBy: owner.id,
    });
    expect(await updateUserSettings(store, owner, owner.id, custom, now)).toBe(
      "updated",
    );
  });

  it("lists every user's settings for the OWNER only", async () => {
    const { store, owner } = await seedOwner();
    const { user } = await seedUser(store, owner, "friend@example.com");
    expect(await listUserSettings(store, user)).toBeNull();
    const all = await listUserSettings(store, owner);
    expect([...(all?.keys() ?? [])].sort()).toEqual([owner.id, user.id].sort());
  });

  it("reports today's usage against the user's own limits", async () => {
    const { store, owner } = await seedOwner();
    expect(await getOwnSendingAllowance(store, owner, now)).toMatchObject({
      usage: { total: 0, bulk: 0 },
      settings: defaultUserSettings,
    });
    expect(quotaDay(new Date("2026-10-06T23:59:59.999Z"))).toBe("2026-10-06");
    expect(quotaDay(new Date("2026-10-07T00:00:00.000Z"))).toBe("2026-10-07");
  });
});

describe("validateSettings", () => {
  const valid = {
    sendingEnabled: "on",
    contactsEnabled: "on",
    schedulingEnabled: "on",
    dailyTotalEmails: "50",
    dailyBulkRecipients: "25",
    maxBulkRecipientsPerOperation: "10",
    maxScheduledEmails: "20",
    maxRecurringSchedules: "5",
    maxFutureSchedulingWindowDays: "30",
  };

  it("reads checkboxes and whole numbers", () => {
    expect(validateSettings(form(valid))).toEqual({
      success: true,
      data: {
        sendingEnabled: true,
        bulkSendingEnabled: false,
        templatesEnabled: false,
        contactsEnabled: true,
        schedulingEnabled: true,
        recurringEnabled: false,
        dailyTotalEmails: 50,
        dailyBulkRecipients: 25,
        maxBulkRecipientsPerOperation: 10,
        maxScheduledEmails: 20,
        maxRecurringSchedules: 5,
        maxFutureSchedulingWindowDays: 30,
      },
    });
  });

  it("enforces bounds, including the per-send cap the function timeout allows", () => {
    for (const [field, value] of [
      ["dailyTotalEmails", "501"],
      ["dailyTotalEmails", "-1"],
      ["dailyBulkRecipients", "2.5"],
      ["maxBulkRecipientsPerOperation", "0"],
      ["maxBulkRecipientsPerOperation", "21"],
      ["maxBulkRecipientsPerOperation", "1e1"],
      ["dailyTotalEmails", ""],
      ["maxScheduledEmails", "101"],
      ["maxRecurringSchedules", "21"],
      ["maxFutureSchedulingWindowDays", "0"],
      ["maxFutureSchedulingWindowDays", "366"],
    ]) {
      const result = validateSettings(form({ ...valid, [field]: value }));
      expect(result.success, `${field}=${value}`).toBe(false);
    }
  });
});
