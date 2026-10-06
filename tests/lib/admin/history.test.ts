// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  getOperationDetail,
  historyPageSize,
  historyRange,
  historyReadBudget,
  parseHistoryQuery,
  searchSendHistory,
  sendFailureCategory,
} from "@/lib/admin/history";
import { createMemoryStore } from "@/lib/admin/memoryStore";
import type { SendRecord } from "@/lib/admin/model";
import { sendRecordId } from "@/lib/admin/sending";
import type { AdminStore } from "@/lib/admin/store";
import { now, seedOwner, seedUser } from "@/tests/helpers/admin";

const day = 24 * 60 * 60_000;

function operationId(at: number, salt: string) {
  return `${String(at).padStart(13, "0")}.${salt.padEnd(22, "A").slice(0, 22)}`;
}

function record(
  userId: string,
  at: number,
  overrides: Partial<SendRecord> = {},
): SendRecord {
  const op = overrides.operationId ?? operationId(at, `op${at}`);
  const recipient = overrides.recipient ?? "rahul@example.com";
  const iso = new Date(at).toISOString();
  return {
    userId,
    senderIdentityId: "s1",
    gmailConnectionId: "g1",
    senderEmail: "alice@gmail.com",
    subject: "Hello",
    templateId: null,
    bulk: false,
    quotaDay: iso.slice(0, 10),
    status: "SENT",
    attempts: 1,
    gmailMessageId: "m1",
    failureCode: null,
    createdAt: iso,
    updatedAt: iso,
    completedAt: iso,
    ...overrides,
    id: sendRecordId(op, recipient),
    operationId: op,
    recipient,
  };
}

/** Stores records as they are, through the store's own write path. */
async function seed(store: AdminStore, records: SendRecord[]) {
  for (const item of records) {
    const result = await store.reserveSends({
      userId: item.userId,
      day: item.quotaDay,
      bulk: false,
      limits: { dailyTotalEmails: 100_000, dailyBulkRecipients: 100_000 },
      create: [item],
      retry: [],
    });
    if (result !== "reserved") throw new Error(result);
  }
}

async function setup() {
  const { store, owner } = await seedOwner();
  const alice = (await seedUser(store, owner, "alice@example.com")).user;
  const bob = (await seedUser(store, owner, "bob@example.com")).user;
  return { store, owner, alice, bob };
}

describe("parseHistoryQuery", () => {
  it("keeps only known filters with allowed values", () => {
    expect(
      parseHistoryQuery({
        status: "FAILED",
        from: "2026-10-01",
        to: "2026-10-06",
        recipient: " Rahul@Example.com ",
        sender: "alice",
        type: "bulk",
        origin: "scheduled",
        category: "TRANSIENT",
        schedule: "123e4567-e89b-42d3-a456-426614174000",
        userId: "someone-else",
      }),
    ).toEqual({
      filters: {
        status: "FAILED",
        from: "2026-10-01",
        to: "2026-10-06",
        recipient: "rahul@example.com",
        sender: "alice",
        type: "bulk",
        origin: "scheduled",
        category: "TRANSIENT",
        scheduleId: "123e4567-e89b-42d3-a456-426614174000",
      },
      cursor: null,
      error: null,
    });
  });

  it("ignores malformed values and reports a reversed range", () => {
    const parsed = parseHistoryQuery({
      status: "DELETED",
      from: "2026-02-30",
      to: "yesterday",
      type: ["bulk", "individual"],
      category: "constructor",
      schedule: "../x",
      cursor: "' OR 1=1",
    });
    expect(parsed.filters).toMatchObject({
      status: null,
      from: null,
      to: null,
      type: null,
      category: null,
      scheduleId: null,
    });
    expect(parsed.cursor).toBeNull();
    expect(
      parseHistoryQuery({ from: "2026-10-06", to: "2026-10-01" }).error,
    ).toBe("The start date is after the end date.");
  });

  it("turns dates into sort-key bounds", () => {
    expect(historyRange({ from: null, to: null })).toEqual({
      lower: "0",
      upper: "~",
    });
    expect(historyRange({ from: "2026-10-06", to: "2026-10-06" })).toEqual({
      lower: String(Date.parse("2026-10-06T00:00:00.000Z")).padStart(13, "0"),
      upper: `${String(Date.parse("2026-10-06T23:59:59.999Z")).padStart(13, "0")}~`,
    });
  });
});

describe("searchSendHistory", () => {
  it("lists only the actor's own sends, newest first", async () => {
    const { store, alice, bob } = await setup();
    const t = now.getTime();
    await seed(store, [
      record(alice.id, t - 2 * day, { subject: "old" }),
      record(alice.id, t, { subject: "new" }),
      record(bob.id, t - day, { subject: "bob's" }),
    ]);
    const page = await searchSendHistory(
      store,
      alice,
      parseHistoryQuery({}).filters,
      null,
    );
    expect(page.records.map((item) => item.subject)).toEqual(["new", "old"]);
    expect(page.next).toBeNull();
  });

  it("filters by status, recipient, sender, type, origin, category, schedule, and date", async () => {
    const { store, alice } = await setup();
    const t = now.getTime();
    const scheduleId = "123e4567-e89b-42d3-a456-426614174000";
    await seed(store, [
      record(alice.id, t - 3 * day, { subject: "a" }),
      record(alice.id, t - 2 * day, {
        subject: "b",
        status: "FAILED",
        failureCode: "gmail-rate-limited",
        recipient: "priya@example.com",
        bulk: true,
      }),
      record(alice.id, t - day, {
        subject: "c",
        status: "UNCERTAIN",
        scheduleId,
        senderEmail: "work@gmail.com",
      }),
    ]);
    const search = async (query: Record<string, string>) =>
      (
        await searchSendHistory(
          store,
          alice,
          parseHistoryQuery(query).filters,
          null,
        )
      ).records.map((item) => item.subject);

    expect(await search({ status: "FAILED" })).toEqual(["b"]);
    expect(await search({ recipient: "PRIYA" })).toEqual(["b"]);
    expect(await search({ sender: "work@" })).toEqual(["c"]);
    expect(await search({ type: "bulk" })).toEqual(["b"]);
    expect(await search({ type: "individual" })).toEqual(["c", "a"]);
    expect(await search({ origin: "scheduled" })).toEqual(["c"]);
    expect(await search({ origin: "immediate" })).toEqual(["b", "a"]);
    expect(await search({ category: "TRANSIENT" })).toEqual(["b"]);
    expect(await search({ category: "UNCERTAIN" })).toEqual(["c"]);
    expect(await search({ schedule: scheduleId })).toEqual(["c"]);
    const from = new Date(t - 2 * day).toISOString().slice(0, 10);
    const to = new Date(t - 2 * day).toISOString().slice(0, 10);
    expect(await search({ from, to })).toEqual(["b"]);
    expect(await search({ from })).toEqual(["c", "b"]);
  });

  it("pages with a cursor inside the actor's own partition", async () => {
    const { store, alice, bob } = await setup();
    const t = now.getTime();
    const records = Array.from({ length: historyPageSize + 3 }, (_, index) =>
      record(alice.id, t - index * 60_000, { subject: `s${index}` }),
    );
    await seed(store, records);
    await seed(store, [record(bob.id, t, { subject: "bob" })]);
    const filters = parseHistoryQuery({}).filters;

    const first = await searchSendHistory(store, alice, filters, null);
    expect(first.records).toHaveLength(historyPageSize);
    expect(first.next).toBe(first.records.at(-1)?.id);
    const second = await searchSendHistory(store, alice, filters, first.next);
    expect(second.records.map((item) => item.subject)).toEqual([
      `s${historyPageSize}`,
      `s${historyPageSize + 1}`,
      `s${historyPageSize + 2}`,
    ]);
    expect(second.next).toBeNull();

    const asBob = await searchSendHistory(store, bob, filters, first.next);
    expect(asBob.records.map((item) => item.subject)).toEqual([]);
  });

  it("stops after the read budget and offers to continue", async () => {
    const { store, alice } = await setup();
    const t = now.getTime();
    await seed(
      store,
      Array.from({ length: historyReadBudget + 10 }, (_, index) =>
        record(alice.id, t - index * 1000, { subject: `s${index}` }),
      ),
    );
    const reads: number[] = [];
    const counting = {
      ...store,
      listSendRecordsPage: async (
        ...args: Parameters<AdminStore["listSendRecordsPage"]>
      ) => {
        reads.push(args[2].limit);
        return store.listSendRecordsPage(...args);
      },
    } satisfies AdminStore;
    const page = await searchSendHistory(
      counting,
      alice,
      parseHistoryQuery({ status: "FAILED" }).filters,
      null,
    );
    expect(page).toMatchObject({ records: [], truncated: true });
    expect(page.next).not.toBeNull();
    expect(reads.reduce((sum, limit) => sum + limit, 0)).toBe(
      historyReadBudget,
    );
  });
});

describe("getOperationDetail", () => {
  it("returns every recipient of the actor's own operation only", async () => {
    const { store, alice, bob } = await setup();
    const t = now.getTime();
    const op = operationId(t, "shared");
    await seed(store, [
      record(alice.id, t, { operationId: op, recipient: "z@example.com" }),
      record(alice.id, t, { operationId: op, recipient: "a@example.com" }),
    ]);
    const detail = await getOperationDetail(store, alice, op);
    expect(detail?.records.map((item) => item.recipient)).toEqual([
      "a@example.com",
      "z@example.com",
    ]);
    expect(detail).toMatchObject({ schedule: null, run: null });
    expect(await getOperationDetail(store, bob, op)).toBeNull();
    expect(await getOperationDetail(store, alice, "../etc")).toBeNull();
    expect(await getOperationDetail(createMemoryStore(), alice, op)).toBeNull();
  });

  it("categorizes failures like scheduled occurrences", () => {
    expect(
      sendFailureCategory({ status: "FAILED", failureCode: "gmail-rejected" }),
    ).toBe("REJECTED");
    expect(
      sendFailureCategory({ status: "UNCERTAIN", failureCode: null }),
    ).toBe("UNCERTAIN");
    expect(
      sendFailureCategory({ status: "SENT", failureCode: null }),
    ).toBeNull();
  });
});
