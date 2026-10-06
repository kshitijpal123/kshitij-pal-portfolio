// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as actions from "@/lib/admin/actions";
import { idleFormState } from "@/lib/admin/formState";
import type { GmailClient, GmailSendResult } from "@/lib/admin/gmailApi";
import type { GoogleOAuthClient } from "@/lib/admin/googleOAuth";
import { rateLimits, type RateLimitedAction } from "@/lib/admin/rateLimit";
import { executeScheduledOccurrence } from "@/lib/admin/scheduleExecution";
import type { ScheduleTriggers } from "@/lib/admin/scheduler";
import { createSchedule } from "@/lib/admin/schedules";
import { newOperationId } from "@/lib/admin/sending";
import { defaultUserSettings } from "@/lib/admin/settings";
import type { AdminStore } from "@/lib/admin/store";
import {
  createLocalTokenCipher,
  type TokenCipher,
} from "@/lib/admin/tokenCipher";
import { seedOwner, seedUser } from "@/tests/helpers/admin";
import { createFakeGoogle, refreshToken } from "@/tests/helpers/gmail";
import { createFakeGmail, seedConnectedSender } from "@/tests/helpers/mail";
import { NavigationSignal } from "@/tests/helpers/nextRequest";
import { createScheduleTriggers } from "@/tests/helpers/schedule";

const next = await vi.hoisted(async () => {
  const { createNextRequestMocks } =
    await import("@/tests/helpers/nextRequest");
  return {
    mocks: createNextRequestMocks(),
    store: undefined as AdminStore | undefined,
    google: null as GoogleOAuthClient | null,
    cipher: null as TokenCipher | null,
    gmail: null as GmailClient | null,
    triggers: null as ScheduleTriggers | null,
  };
});

vi.mock("next/headers", () => next.mocks.headers);
vi.mock("next/navigation", () => next.mocks.navigation);
vi.mock("next/cache", () => next.mocks.cache);
vi.mock("next/server", () => next.mocks.server);
vi.mock("@/lib/admin/getAdminStore", () => ({
  getAdminStore: () => next.store,
}));
vi.mock("@/lib/admin/googleOAuth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin/googleOAuth")>()),
  getGoogleOAuthClient: () => next.google,
}));
vi.mock("@/lib/admin/tokenCipher", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin/tokenCipher")>()),
  getTokenCipher: () => next.cipher,
}));
vi.mock("@/lib/admin/gmailApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin/gmailApi")>()),
  getGmailClient: () => next.gmail,
}));
vi.mock("@/lib/admin/scheduler", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin/scheduler")>()),
  getScheduleTriggers: () => next.triggers,
}));

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.append(key, value);
  return data;
}

function signIn(token: string) {
  next.mocks.jar.set("admin_session", { value: token });
}

async function navigation(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(NavigationSignal);
  return (error as InstanceType<typeof NavigationSignal>).to;
}

let logs: string[];

beforeEach(() => {
  next.mocks.jar.clear();
  next.google = null;
  next.cipher = null;
  next.gmail = null;
  next.triggers = null;
  logs = [];
  for (const method of ["log", "info", "warn", "error"] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function setup(results: GmailSendResult[] = []) {
  const { store, owner, ownerToken } = await seedOwner();
  const alice = await seedUser(store, owner, "alice@example.com", "Alice");
  const bob = await seedUser(store, owner, "bob@example.com", "Bob");
  const cipher = createLocalTokenCipher();
  const { identity } = await seedConnectedSender(
    store,
    cipher,
    owner,
    alice.user,
    "alice@gmail.com",
  );
  const google = createFakeGoogle({ issuedAt: new Date() });
  const gmail = createFakeGmail(
    ({ index }) => results[index] ?? { ok: true, messageId: `m${index}` },
  );
  next.store = store;
  next.google = google.client;
  next.cipher = cipher;
  next.gmail = gmail.client;
  return { store, owner, ownerToken, alice, bob, identity, google, gmail };
}

type Context = Awaited<ReturnType<typeof setup>>;

async function exhaust(
  store: AdminStore,
  action: RateLimitedAction,
  userId: string,
) {
  const { limit, windowMs } = rateLimits[action];
  for (let used = 0; used < limit; used += 1) {
    await store.consumeRateLimit(
      `${action}:${userId}`,
      limit,
      windowMs,
      new Date(),
    );
  }
}

function compose(context: Context, emails: string, extra = {}) {
  const operationId = newOperationId(new Date());
  return {
    operationId,
    data: form({
      operationId,
      senderIdentityId: context.identity.id,
      emails,
      subject: "Private subject",
      body: "Private body text",
      ...extra,
    }),
  };
}

async function trail(store: AdminStore, subject: string) {
  return (await store.listAuditEvents(subject, { after: null, limit: 50 }))
    .items;
}

const rateLimited: GmailSendResult = { ok: false, kind: "rate-limited" };

describe("rate limits on actions", () => {
  it("refuses sends over the per-user limit without calling Gmail, and audits it", async () => {
    const context = await setup();
    await exhaust(context.store, "send", context.alice.user.id);
    signIn(context.alice.token);
    const { operationId, data } = compose(context, "rahul@example.com");
    const state = await actions.sendEmailAction(
      { status: "idle", operationId },
      data,
    );
    expect(state).toMatchObject({
      status: "error",
      operationId,
      message: expect.stringContaining("Too many requests"),
    });
    expect(context.gmail.calls).toHaveLength(0);
    expect(await trail(context.store, context.alice.user.id)).toEqual([
      expect.objectContaining({
        action: "send",
        outcome: "rate-limited",
        detail: { limit: "send" },
      }),
    ]);

    signIn(context.bob.token);
    expect(
      (
        await actions.sendEmailAction(
          { status: "idle", operationId: "" },
          compose(context, "x@example.com").data,
        )
      ).message,
    ).not.toContain("Too many requests");
  });

  it("limits bulk submissions separately from individual sends", async () => {
    const context = await setup();
    await exhaust(context.store, "bulk-send", context.alice.user.id);
    signIn(context.alice.token);
    const bulk = compose(context, "a@example.com, b@example.com");
    expect(
      await actions.sendEmailAction(
        { status: "idle", operationId: bulk.operationId },
        bulk.data,
      ),
    ).toMatchObject({ message: expect.stringContaining("Too many requests") });
    expect(context.gmail.calls).toHaveLength(0);

    const single = compose(context, "a@example.com");
    expect(
      await actions.sendEmailAction(
        { status: "idle", operationId: single.operationId },
        single.data,
      ),
    ).toMatchObject({ status: "success" });
  });

  it("fails closed when the limit cannot be checked", async () => {
    const context = await setup();
    next.store = {
      ...context.store,
      consumeRateLimit: async () => {
        throw new Error("ProvisionedThroughputExceededException");
      },
    };
    signIn(context.alice.token);
    const { operationId, data } = compose(context, "rahul@example.com");
    expect(
      await actions.sendEmailAction({ status: "idle", operationId }, data),
    ).toMatchObject({ status: "error" });
    expect(context.gmail.calls).toHaveLength(0);
  });

  it("limits Gmail connection starts and reports a fixed code", async () => {
    const context = await setup();
    await exhaust(context.store, "gmail-connect", context.alice.user.id);
    signIn(context.alice.token);
    expect(
      await navigation(
        actions.startGmailConnectionAction(
          form({ identityId: context.identity.id }),
        ),
      ),
    ).toBe("/admin?gmail=rate-limited");
    expect(context.google.calls.authorizationUrl).toHaveLength(0);
  });

  it("limits OWNER administration", async () => {
    const context = await setup();
    await exhaust(context.store, "administration", context.owner.id);
    signIn(context.ownerToken);
    await actions.setUserStatusAction(
      form({ userId: context.alice.user.id, status: "DISABLED" }),
    );
    expect(
      (await context.store.getUserById(context.alice.user.id))?.status,
    ).toBe("ACTIVE");
  });

  it("never limits scheduled occurrences", async () => {
    const context = await setup();
    const triggers = createScheduleTriggers();
    const created = await createSchedule(
      { store: context.store, triggers: triggers.triggers },
      context.alice.user,
      {
        senderIdentityId: context.identity.id,
        contactIds: [],
        emails: ["rahul@example.com"],
        templateId: null,
        subject: "Hi",
        body: "Hello",
        type: "ONE_TIME",
        startLocal: new Date(Date.now() + 3600_000).toISOString().slice(0, 16),
        endLocal: null,
        timeZone: "UTC",
        recurrence: null,
      },
      new Date(),
    );
    if (!created.ok) throw new Error(created.reason);
    for (const action of ["send", "bulk-send", "retry"] as const) {
      await exhaust(context.store, action, context.alice.user.id);
    }
    const at = created.schedule.startAt;
    const result = await executeScheduledOccurrence(
      {
        store: context.store,
        google: context.google.client,
        cipher: next.cipher!,
        gmail: context.gmail.client,
        triggers: triggers.triggers,
        clock: () => new Date(at),
      },
      {
        scheduleId: created.schedule.id,
        scheduledTime: at.replace(".000", ""),
      },
      new Date(at),
    );
    expect(result).toEqual({ outcome: "SENT", failureCode: null });
    expect(context.gmail.calls).toHaveLength(1);
  });
});

describe("audit from actions", () => {
  it("records sends as counts, never recipients, subjects, or bodies", async () => {
    const context = await setup();
    signIn(context.alice.token);
    const { operationId, data } = compose(context, "rahul@example.com");
    await actions.sendEmailAction({ status: "idle", operationId }, data);
    const events = await trail(context.store, context.alice.user.id);
    expect(events).toEqual([
      expect.objectContaining({
        action: "send",
        outcome: "success",
        actorId: context.alice.user.id,
        detail: {
          operationId,
          recipients: 1,
          sent: 1,
          failed: 0,
          uncertain: 0,
          skipped: 0,
        },
      }),
    ]);
    expect(JSON.stringify(events)).not.toMatch(
      /rahul@example\.com|Private subject|Private body/,
    );
  });

  it("records settings changes by the OWNER and refusals for a USER", async () => {
    const context = await setup();
    const settings = {
      ...Object.fromEntries(
        Object.entries(defaultUserSettings).map(([key, value]) => [
          key,
          typeof value === "boolean" ? (value ? "on" : "") : String(value),
        ]),
      ),
      userId: context.alice.user.id,
      dailyTotalEmails: "12",
    };
    signIn(context.ownerToken);
    expect(
      await actions.updateUserSettingsAction(idleFormState, form(settings)),
    ).toMatchObject({ status: "success" });
    expect(next.mocks.cache.revalidatePath).toHaveBeenCalledWith(
      "/admin/settings",
    );
    expect(await trail(context.store, context.owner.id)).toEqual([
      expect.objectContaining({
        action: "settings.update",
        outcome: "success",
        targetId: context.alice.user.id,
        detail: expect.objectContaining({ dailyTotalEmails: 12 }),
      }),
    ]);

    signIn(context.bob.token);
    await actions.updateUserSettingsAction(idleFormState, form(settings));
    expect(await trail(context.store, context.bob.user.id)).toEqual([
      expect.objectContaining({ action: "settings.update", outcome: "denied" }),
    ]);
  });

  it("records sign-out and Gmail checks without credentials", async () => {
    const context = await setup();
    signIn(context.alice.token);
    await navigation(
      actions.verifyGmailConnectionAction(
        form({ identityId: context.identity.id }),
      ),
    );
    await navigation(actions.logoutAction());
    const events = await trail(context.store, context.alice.user.id);
    expect(events.map((event) => [event.action, event.outcome]).sort()).toEqual(
      [
        ["auth.logout", "success"],
        ["gmail.check", "success"],
      ],
    );
    expect(JSON.stringify(events)).not.toContain(refreshToken);
    expect(JSON.stringify(events)).not.toContain(context.alice.token);
  });
});

describe("retryOperationAction", () => {
  async function failedSend(context: Context) {
    signIn(context.alice.token);
    const { operationId, data } = compose(context, "rahul@example.com");
    await actions.sendEmailAction({ status: "idle", operationId }, data);
    return operationId;
  }

  it("retries the actor's own failed send with the message entered again", async () => {
    const context = await setup([rateLimited]);
    const operationId = await failedSend(context);
    expect(
      await navigation(
        actions.retryOperationAction(
          form({
            operationId,
            subject: "Private subject",
            body: "Private body text",
            userId: context.bob.user.id,
          }),
        ),
      ),
    ).toBe(`/admin/history/${operationId}?retry=retried`);
    expect(context.gmail.calls).toHaveLength(2);
    expect(
      (
        await context.store.listSendRecordsForOperation(
          context.alice.user.id,
          operationId,
        )
      ).map((record) => record.status),
    ).toEqual(["SENT"]);
    expect(
      (await trail(context.store, context.alice.user.id))[0],
    ).toMatchObject({
      action: "send.retry",
      outcome: "success",
      detail: expect.objectContaining({ operationId, sent: 1 }),
    });

    expect(
      await navigation(
        actions.retryOperationAction(
          form({ operationId, subject: "S", body: "B" }),
        ),
      ),
    ).toBe(`/admin/history/${operationId}?retry=nothing-to-retry`);
    expect(context.gmail.calls).toHaveLength(2);
  });

  it("does not retry another user's operation", async () => {
    const context = await setup([rateLimited]);
    const operationId = await failedSend(context);
    signIn(context.bob.token);
    expect(
      await navigation(
        actions.retryOperationAction(
          form({ operationId, subject: "S", body: "B" }),
        ),
      ),
    ).toBe(`/admin/history/${operationId}?retry=not-found`);
    expect(context.gmail.calls).toHaveLength(1);
  });

  it("answers with fixed codes for bad input, missing configuration, and limits", async () => {
    const context = await setup([rateLimited]);
    const operationId = await failedSend(context);

    expect(
      await navigation(
        actions.retryOperationAction(
          form({ operationId: "javascript:alert(1)", subject: "S", body: "B" }),
        ),
      ),
    ).toBe("/admin/history?retry=not-found");
    expect(
      await navigation(actions.retryOperationAction(form({ operationId }))),
    ).toBe(`/admin/history/${operationId}?retry=message-required`);
    expect(
      await navigation(
        actions.retryOperationAction(
          form({ operationId, subject: "", body: "B" }),
        ),
      ),
    ).toBe(`/admin/history/${operationId}?retry=invalid-message`);

    await exhaust(context.store, "retry", context.alice.user.id);
    expect(
      await navigation(
        actions.retryOperationAction(
          form({ operationId, subject: "S", body: "B" }),
        ),
      ),
    ).toBe(`/admin/history/${operationId}?retry=rate-limited`);

    next.google = null;
    expect(
      await navigation(
        actions.retryOperationAction(
          form({ operationId, subject: "S", body: "B" }),
        ),
      ),
    ).toBe(`/admin/history/${operationId}?retry=unavailable`);
    expect(context.gmail.calls).toHaveLength(1);
  });

  it("requires a session", async () => {
    await setup();
    expect(
      await navigation(
        actions.retryOperationAction(form({ operationId: "x" })),
      ),
    ).toBe("/admin/login");
  });

  it("never logs the message or credentials when it fails", async () => {
    const context = await setup([rateLimited]);
    const operationId = await failedSend(context);
    next.store = {
      ...context.store,
      listSendRecordsForOperation: async () => {
        throw new Error(`leak ${refreshToken} Private body text`);
      },
    };
    expect(
      await navigation(
        actions.retryOperationAction(
          form({ operationId, subject: "S", body: "Private body text" }),
        ),
      ),
    ).toBe(`/admin/history/${operationId}?retry=failed`);
    expect(logs).toEqual(["[admin] Retry failed (Error)."]);
  });
});
