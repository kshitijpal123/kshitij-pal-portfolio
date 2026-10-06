// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  attemptWindowMs,
  bootstrapOwner,
  endSession,
  getBootstrapToken,
  isBootstrapAvailable,
  login,
  maxFailedAttempts,
  resolveSession,
} from "@/lib/admin/auth";
import { createMemoryStore } from "@/lib/admin/memoryStore";
import { sessionTtlMs } from "@/lib/admin/model";
import { hashToken } from "@/lib/admin/tokens";
import { setUserStatus } from "@/lib/admin/users";
import {
  later,
  now,
  ownerPassword,
  seedOwner,
  seedUser,
  setupToken,
  userPassword,
} from "@/tests/helpers/admin";

describe("login", () => {
  it("signs in an active user and starts a stored, hashed session", async () => {
    const { store } = await seedOwner();
    const result = await login(
      store,
      { email: "owner@example.com", password: ownerPassword },
      later(1000),
    );

    expect(result).toMatchObject({ ok: true, user: { role: "OWNER" } });
    if (!result.ok) return;
    expect(result.user).not.toHaveProperty("passwordHash");
    expect(await store.getSession(result.token)).toBeNull();
    expect(await store.getSession(hashToken(result.token))).toMatchObject({
      userId: result.user.id,
    });
    expect(result.expiresAt.getTime()).toBe(
      later(1000).getTime() + sessionTtlMs,
    );
    expect((await store.getUserById(result.user.id))?.lastLoginAt).toBe(
      later(1000).toISOString(),
    );
  });

  it("returns the same result for a wrong password and an unknown user", async () => {
    const { store } = await seedOwner();
    const wrong = await login(
      store,
      { email: "owner@example.com", password: "wrong password!" },
      now,
    );
    const unknown = await login(
      store,
      { email: "nobody@example.com", password: ownerPassword },
      now,
    );

    expect(wrong).toEqual({ ok: false, reason: "invalid" });
    expect(unknown).toEqual(wrong);
  });

  it("rejects a disabled user, even with the right password", async () => {
    const { store, owner } = await seedOwner();
    const { user } = await seedUser(store, owner, "friend@example.com");
    await setUserStatus(store, owner, user.id, "DISABLED", now);

    expect(
      await login(
        store,
        { email: "friend@example.com", password: userPassword },
        now,
      ),
    ).toEqual({ ok: false, reason: "invalid" });
  });

  it("throttles an email after repeated failures, then recovers", async () => {
    const { store } = await seedOwner();
    const credentials = {
      email: "owner@example.com",
      password: "wrong one!!!",
    };
    for (let i = 0; i < maxFailedAttempts; i++) {
      expect(await login(store, credentials, now)).toMatchObject({
        reason: "invalid",
      });
    }

    const right = { email: "owner@example.com", password: ownerPassword };
    expect(await login(store, right, later(1000))).toEqual({
      ok: false,
      reason: "throttled",
    });
    expect(await login(store, right, later(attemptWindowMs + 1))).toMatchObject(
      {
        ok: true,
      },
    );
  });
});

describe("sessions", () => {
  it("resolves a valid session to the current public user", async () => {
    const { store, owner, ownerToken } = await seedOwner();
    const user = await resolveSession(store, ownerToken, later(1000));
    expect(user).toEqual(owner);
    expect(user).not.toHaveProperty("passwordHash");
    expect(user).not.toHaveProperty("sessionsValidAfter");
  });

  it("rejects missing, malformed, and unknown tokens", async () => {
    const { store } = await seedOwner();
    expect(await resolveSession(store, undefined, now)).toBeNull();
    expect(await resolveSession(store, "not a token", now)).toBeNull();
    expect(await resolveSession(store, "a".repeat(43), now)).toBeNull();
  });

  it("rejects and deletes an expired session", async () => {
    const { store, ownerToken } = await seedOwner();
    expect(
      await resolveSession(store, ownerToken, later(sessionTtlMs)),
    ).toBeNull();
    expect(await store.getSession(hashToken(ownerToken))).toBeNull();
  });

  it("ends a session on logout", async () => {
    const { store, ownerToken } = await seedOwner();
    await endSession(store, ownerToken);
    expect(await resolveSession(store, ownerToken, now)).toBeNull();
  });

  it("rejects a disabled user's sessions, and keeps them dead after re-enabling", async () => {
    const { store, owner } = await seedOwner();
    const { user, token } = await seedUser(store, owner, "friend@example.com");
    expect(await resolveSession(store, token, later(1))).toMatchObject({
      id: user.id,
    });

    await setUserStatus(store, owner, user.id, "DISABLED", later(2));
    expect(await resolveSession(store, token, later(3))).toBeNull();

    await setUserStatus(store, owner, user.id, "ACTIVE", later(4));
    expect(await resolveSession(store, token, later(5))).toBeNull();

    const fresh = await login(
      store,
      { email: "friend@example.com", password: userPassword },
      later(6),
    );
    expect(fresh.ok).toBe(true);
    if (fresh.ok) {
      expect(await resolveSession(store, fresh.token, later(7))).toMatchObject({
        id: user.id,
      });
    }
  });
});

describe("owner bootstrap", () => {
  const input = {
    email: "owner@example.com",
    name: "Owner",
    password: ownerPassword,
    setupToken,
  };

  it("is off without a configured token of at least 32 characters", async () => {
    expect(getBootstrapToken({})).toBeNull();
    expect(
      getBootstrapToken({ ADMIN_BOOTSTRAP_TOKEN: "too-short" }),
    ).toBeNull();
    expect(
      getBootstrapToken({ ADMIN_BOOTSTRAP_TOKEN: ` ${setupToken} ` }),
    ).toBe(setupToken);

    const store = createMemoryStore();
    expect(await isBootstrapAvailable(store, null)).toBe(false);
    expect(await bootstrapOwner(store, input, null, now)).toEqual({
      ok: false,
      reason: "unavailable",
    });
    expect(await store.ownerExists()).toBe(false);
  });

  it("rejects a wrong token and throttles guessing", async () => {
    const store = createMemoryStore();
    const wrong = { ...input, setupToken: "x".repeat(40) };
    for (let i = 0; i < maxFailedAttempts; i++) {
      expect(await bootstrapOwner(store, wrong, setupToken, now)).toEqual({
        ok: false,
        reason: "invalid-token",
      });
    }
    expect(await bootstrapOwner(store, input, setupToken, now)).toEqual({
      ok: false,
      reason: "throttled",
    });
    expect(await store.ownerExists()).toBe(false);
  });

  it("creates exactly one OWNER, then closes for good", async () => {
    const store = createMemoryStore();
    expect(await isBootstrapAvailable(store, setupToken)).toBe(true);

    const first = await bootstrapOwner(store, input, setupToken, now);
    expect(first).toMatchObject({
      ok: true,
      user: { role: "OWNER", status: "ACTIVE", email: "owner@example.com" },
    });
    if (first.ok) expect(first.user).not.toHaveProperty("passwordHash");

    expect(await isBootstrapAvailable(store, setupToken)).toBe(false);
    expect(
      await bootstrapOwner(
        store,
        { ...input, email: "attacker@example.com" },
        setupToken,
        now,
      ),
    ).toEqual({ ok: false, reason: "unavailable" });
    expect(
      (await store.listUsers()).filter((user) => user.role === "OWNER"),
    ).toHaveLength(1);
  });

  it("stores only an Argon2id hash of the owner's password", async () => {
    const store = createMemoryStore();
    await bootstrapOwner(store, input, setupToken, now);
    const [owner] = await store.listUsers();
    expect(owner.passwordHash).toMatch(/^\$argon2id\$/);
    expect(JSON.stringify(owner)).not.toContain(ownerPassword);
  });
});
