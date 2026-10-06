// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  auditPageSize,
  describeAuditAction,
  listAuditTrail,
  recordAudit,
  sanitizeAuditDetail,
  systemAuditSubject,
} from "@/lib/admin/audit";
import { login } from "@/lib/admin/auth";
import { createMemoryStore } from "@/lib/admin/memoryStore";
import type { AdminStore } from "@/lib/admin/store";
import {
  later,
  now,
  ownerPassword,
  seedOwner,
  seedUser,
} from "@/tests/helpers/admin";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("sanitizeAuditDetail", () => {
  it("drops secrets, credentials, message content, and email addresses", () => {
    expect(
      sanitizeAuditDetail({
        refreshToken: "1//secret",
        accessToken: "ya29.secret",
        clientSecret: "s",
        password: "p",
        code: "4/auth-code",
        authCode: "x",
        state: "s",
        codeVerifier: "v",
        nonce: "n",
        cookie: "c",
        body: "Hello",
        subject: "Private",
        content: "c",
        email: "a@b.co",
        recipient: "friend@example.com",
        result: "connected",
        count: 3,
        ok: true,
        missing: null,
      }),
    ).toEqual({
      recipient: "[redacted]",
      result: "connected",
      count: 3,
      ok: true,
      missing: null,
    });
  });

  it("keeps only primitives under plain keys, truncated and bounded", () => {
    const detail = sanitizeAuditDetail({
      long: "x".repeat(500),
      nested: { a: 1 },
      list: [1],
      infinite: Number.POSITIVE_INFINITY,
      "bad key": 1,
      __proto__: { polluted: true },
      constructor: "x",
    });
    expect(detail).toEqual({ long: "x".repeat(120) });
    expect(Object.getPrototypeOf(detail)).toBe(Object.prototype);

    const many = Object.fromEntries(
      Array.from({ length: 30 }, (_, index) => [`k${index}`, index]),
    );
    expect(Object.keys(sanitizeAuditDetail(many))).toHaveLength(16);
  });
});

describe("recordAudit", () => {
  it("appends a sanitized event to the subject's trail", async () => {
    const store = createMemoryStore();
    await recordAudit(
      store,
      {
        subject: "u1",
        actorId: "u1",
        action: "send",
        outcome: "success",
        detail: { sent: 2, subject: "Secret plans" },
      },
      now,
    );
    const page = await store.listAuditEvents("u1", { after: null, limit: 10 });
    expect(page.items).toEqual([
      {
        id: expect.stringMatching(/^2026-10-06T09:00:00\.000Z#[\w-]{16}$/),
        subject: "u1",
        actorId: "u1",
        action: "send",
        outcome: "success",
        targetId: null,
        detail: { sent: 2 },
        at: now.toISOString(),
      },
    ]);
  });

  it("never fails the action it describes", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const store = {
      ...createMemoryStore(),
      appendAuditEvent: async () => {
        throw new Error("leak 1//refresh-token");
      },
    } satisfies AdminStore;
    await expect(
      recordAudit(
        store,
        { subject: "u1", actorId: "u1", action: "send", outcome: "failure" },
        now,
      ),
    ).resolves.toBeUndefined();
    expect(errors).toHaveBeenCalledWith("[admin] Audit write failed (Error).");
  });
});

describe("listAuditTrail", () => {
  it("lets a USER read only their own trail", async () => {
    const { store, owner } = await seedOwner();
    const alice = (await seedUser(store, owner, "alice@example.com")).user;
    const bob = (await seedUser(store, owner, "bob@example.com")).user;
    for (const user of [owner, alice, bob]) {
      await recordAudit(
        store,
        {
          subject: user.id,
          actorId: user.id,
          action: "auth.logout",
          outcome: "success",
        },
        now,
      );
    }

    const own = await listAuditTrail(store, alice, alice.id, null);
    expect(own?.events.map((event) => event.subject)).toEqual([alice.id]);
    expect(await listAuditTrail(store, alice, bob.id, null)).toBeNull();
    expect(await listAuditTrail(store, alice, owner.id, null)).toBeNull();
    expect(
      await listAuditTrail(store, alice, systemAuditSubject, null),
    ).toBeNull();
  });

  it("lets the OWNER read any account's trail and the system trail", async () => {
    const { store, owner } = await seedOwner();
    const alice = (await seedUser(store, owner, "alice@example.com")).user;
    await recordAudit(
      store,
      {
        subject: alice.id,
        actorId: alice.id,
        action: "send",
        outcome: "success",
      },
      now,
    );
    expect(
      (await listAuditTrail(store, owner, alice.id, null))?.events,
    ).toHaveLength(1);
    expect(
      await listAuditTrail(store, owner, systemAuditSubject, null),
    ).toMatchObject({ events: [] });
    expect(await listAuditTrail(store, owner, "no-such-user", null)).toBeNull();
  });

  it("pages newest first with a validated cursor", async () => {
    const { store, owner } = await seedOwner();
    for (let index = 0; index < auditPageSize + 5; index += 1) {
      await recordAudit(
        store,
        {
          subject: owner.id,
          actorId: owner.id,
          action: "settings.update",
          outcome: "success",
          detail: { index },
        },
        new Date(now.getTime() + index * 1000),
      );
    }
    const first = await listAuditTrail(store, owner, owner.id, null);
    expect(first?.events).toHaveLength(auditPageSize);
    expect(first?.events[0].detail.index).toBe(auditPageSize + 4);
    expect(first?.next).not.toBeNull();
    const second = await listAuditTrail(store, owner, owner.id, first!.next);
    expect(second?.events.map((event) => event.detail.index)).toEqual([
      4, 3, 2, 1, 0,
    ]);
    expect(second?.next).toBeNull();

    const bogus = await listAuditTrail(store, owner, owner.id, "../../x");
    expect(bogus?.events).toHaveLength(auditPageSize);
  });
});

describe("sign-in auditing", () => {
  it("records success and failure without the password or unknown addresses", async () => {
    const { store, owner } = await seedOwner();
    await login(store, { email: owner.email, password: ownerPassword }, now);
    await login(
      store,
      { email: owner.email, password: "wrong-password!" },
      later(1),
    );
    await login(
      store,
      { email: "stranger@example.com", password: "whatever-password" },
      later(2),
    );

    const own = await store.listAuditEvents(owner.id, {
      after: null,
      limit: 10,
    });
    expect(own.items.map((event) => [event.outcome, event.detail])).toEqual([
      ["failure", { reason: "wrong-password" }],
      ["success", {}],
    ]);
    const system = await store.listAuditEvents(systemAuditSubject, {
      after: null,
      limit: 10,
    });
    expect(system.items).toHaveLength(1);
    expect(system.items[0]).toMatchObject({
      actorId: null,
      targetId: null,
      detail: { reason: "unknown-account" },
    });
    expect(JSON.stringify([own, system])).not.toMatch(
      /stranger@example\.com|wrong-password!|whatever-password/,
    );
  });

  it("labels every action", () => {
    expect(describeAuditAction("send.retry")).toBe("Retry");
    expect(describeAuditAction("schedule.run")).toBe("Scheduled occurrence");
  });
});
