// @vitest-environment node
import { describe, expect, it } from "vitest";
import { login } from "@/lib/admin/auth";
import {
  acceptInvitation,
  createInvitation,
  findOpenInvitation,
  invitationPath,
  revokeInvitation,
} from "@/lib/admin/invitations";
import { invitationTtlMs, maxUsers } from "@/lib/admin/model";
import { hashToken } from "@/lib/admin/tokens";
import { getUserAdministration } from "@/lib/admin/users";
import { later, now, seedOwner, seedUser } from "@/tests/helpers/admin";

const account = { name: "Friend", password: "friend passphrase" };

describe("creating invitations", () => {
  it("lets the OWNER invite and stores only a hash of a secure token", async () => {
    const { store, owner } = await seedOwner();
    const result = await createInvitation(
      store,
      owner,
      "friend@example.com",
      now,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(result.invitation).not.toHaveProperty("tokenHash");
    expect(result.invitation).toMatchObject({
      email: "friend@example.com",
      role: "USER",
      status: "PENDING",
      invitedBy: owner.id,
      expiresAt: later(invitationTtlMs).toISOString(),
    });
    expect(invitationPath(result.token)).toBe(`/admin/invite/${result.token}`);

    const [stored] = await store.listInvitations();
    expect(stored.tokenHash).toBe(hashToken(result.token));
    expect(JSON.stringify(await store.listInvitations())).not.toContain(
      result.token,
    );
  });

  it("does not let a USER invite anyone", async () => {
    const { store, owner } = await seedOwner();
    const { user } = await seedUser(store, owner, "friend@example.com");

    expect(
      await createInvitation(store, user, "other@example.com", now),
    ).toEqual({ ok: false, reason: "forbidden" });
    expect(await store.listInvitations()).toHaveLength(1);
  });

  it("refuses an email that already has an account or a pending invitation", async () => {
    const { store, owner } = await seedOwner();
    expect(
      await createInvitation(store, owner, "owner@example.com", now),
    ).toEqual({ ok: false, reason: "already-user" });

    await createInvitation(store, owner, "friend@example.com", now);
    expect(
      await createInvitation(store, owner, "friend@example.com", now),
    ).toEqual({ ok: false, reason: "already-invited" });
  });
});

describe("accepting invitations", () => {
  it("creates an ACTIVE USER with their own password and the invited email", async () => {
    const { store, owner } = await seedOwner();
    const invitation = await createInvitation(
      store,
      owner,
      "friend@example.com",
      now,
    );
    if (!invitation.ok) throw new Error("setup");

    const result = await acceptInvitation(
      store,
      invitation.token,
      account,
      later(1000),
    );
    expect(result).toMatchObject({
      ok: true,
      user: {
        email: "friend@example.com",
        name: "Friend",
        role: "USER",
        status: "ACTIVE",
      },
    });
    if (result.ok) expect(result.user).not.toHaveProperty("passwordHash");

    const [stored] = await store.listInvitations();
    expect(stored).toMatchObject({
      status: "ACCEPTED",
      acceptedAt: later(1000).toISOString(),
    });
    expect(
      await login(
        store,
        { email: "friend@example.com", password: account.password },
        later(2000),
      ),
    ).toMatchObject({ ok: true });
  });

  it("works only once", async () => {
    const { store, owner } = await seedOwner();
    const invitation = await createInvitation(
      store,
      owner,
      "friend@example.com",
      now,
    );
    if (!invitation.ok) throw new Error("setup");

    expect(
      (await acceptInvitation(store, invitation.token, account, now)).ok,
    ).toBe(true);
    expect(
      await acceptInvitation(
        store,
        invitation.token,
        { ...account, name: "Again" },
        now,
      ),
    ).toEqual({ ok: false, reason: "unavailable" });
    expect(await findOpenInvitation(store, invitation.token, now)).toBeNull();
    expect(await store.listUsers()).toHaveLength(2);
  });

  it("rejects an expired invitation", async () => {
    const { store, owner } = await seedOwner();
    const invitation = await createInvitation(
      store,
      owner,
      "friend@example.com",
      now,
    );
    if (!invitation.ok) throw new Error("setup");

    const expired = later(invitationTtlMs);
    expect(
      await findOpenInvitation(store, invitation.token, expired),
    ).toBeNull();
    expect(
      await acceptInvitation(store, invitation.token, account, expired),
    ).toEqual({ ok: false, reason: "unavailable" });

    const admin = await getUserAdministration(store, owner, expired);
    expect(admin?.invitations[0].status).toBe("EXPIRED");
  });

  it("rejects a revoked invitation", async () => {
    const { store, owner } = await seedOwner();
    const invitation = await createInvitation(
      store,
      owner,
      "friend@example.com",
      now,
    );
    if (!invitation.ok) throw new Error("setup");

    expect(
      await revokeInvitation(store, owner, invitation.invitation.id, now),
    ).toBe(true);
    expect(
      await acceptInvitation(store, invitation.token, account, now),
    ).toEqual({ ok: false, reason: "unavailable" });
  });

  it("rejects unknown and malformed tokens", async () => {
    const { store } = await seedOwner();
    for (const token of ["", "nope", "a".repeat(43)]) {
      expect(await acceptInvitation(store, token, account, now)).toEqual({
        ok: false,
        reason: "unavailable",
      });
    }
  });

  it("never creates a second account for an email that already has one", async () => {
    const { store, owner } = await seedOwner();
    const invitation = await createInvitation(
      store,
      owner,
      "friend@example.com",
      now,
    );
    if (!invitation.ok) throw new Error("setup");
    const existing = await store.getUserById(owner.id);
    if (!existing) throw new Error("setup");

    // The store enforces unique emails even if a caller skipped every check.
    expect(
      await store.acceptInvitation(
        invitation.invitation.id,
        { ...existing, id: "another-id", role: "USER" },
        now,
      ),
    ).toBe("email-taken");
    expect(await store.listUsers()).toHaveLength(1);
    expect(
      await findOpenInvitation(store, invitation.token, now),
    ).not.toBeNull();
  });

  it("does not let a USER revoke invitations", async () => {
    const { store, owner } = await seedOwner();
    const { user } = await seedUser(store, owner, "friend@example.com");
    const invitation = await createInvitation(
      store,
      owner,
      "other@example.com",
      now,
    );
    if (!invitation.ok) throw new Error("setup");

    expect(
      await revokeInvitation(store, user, invitation.invitation.id, now),
    ).toBe(false);
    expect(
      await findOpenInvitation(store, invitation.token, now),
    ).not.toBeNull();
  });
});

describe("the five-user limit", () => {
  it("allows one OWNER plus four USERs and no more", async () => {
    const { store, owner } = await seedOwner();
    for (const name of ["a", "b", "c", "d"]) {
      await seedUser(store, owner, `${name}@example.com`);
    }

    expect(await store.listUsers()).toHaveLength(maxUsers);
    expect(await createInvitation(store, owner, "e@example.com", now)).toEqual({
      ok: false,
      reason: "capacity-full",
    });
    expect((await getUserAdministration(store, owner, now))?.capacity).toEqual({
      users: 5,
      pendingInvitations: 0,
      used: 5,
      max: 5,
    });
  });

  it("counts pending invitations toward the limit", async () => {
    const { store, owner } = await seedOwner();
    for (const name of ["a", "b", "c", "d"]) {
      expect(
        (await createInvitation(store, owner, `${name}@example.com`, now)).ok,
      ).toBe(true);
    }

    expect(await createInvitation(store, owner, "e@example.com", now)).toEqual({
      ok: false,
      reason: "capacity-full",
    });
    expect((await getUserAdministration(store, owner, now))?.capacity).toEqual({
      users: 1,
      pendingInvitations: 4,
      used: 5,
      max: 5,
    });
  });

  it("frees a seat when an invitation is revoked or expires", async () => {
    const { store, owner } = await seedOwner();
    const invitations = [];
    for (const name of ["a", "b", "c", "d"]) {
      const result = await createInvitation(
        store,
        owner,
        `${name}@example.com`,
        now,
      );
      if (!result.ok) throw new Error("setup");
      invitations.push(result);
    }

    await revokeInvitation(store, owner, invitations[0].invitation.id, now);
    expect(
      (await createInvitation(store, owner, "e@example.com", now)).ok,
    ).toBe(true);

    const afterExpiry = later(invitationTtlMs);
    expect(
      (await createInvitation(store, owner, "f@example.com", afterExpiry)).ok,
    ).toBe(true);
  });

  it("keeps a disabled user's seat", async () => {
    const { store, owner } = await seedOwner();
    const users = [];
    for (const name of ["a", "b", "c", "d"]) {
      users.push((await seedUser(store, owner, `${name}@example.com`)).user);
    }
    await store.setUserStatus(users[0].id, "DISABLED", now.toISOString());

    expect(await createInvitation(store, owner, "e@example.com", now)).toEqual({
      ok: false,
      reason: "capacity-full",
    });
  });

  it("lets only one of two concurrent invitations take the last seat", async () => {
    const { store, owner } = await seedOwner();
    for (const name of ["a", "b", "c"]) {
      await seedUser(store, owner, `${name}@example.com`);
    }

    const results = await Promise.all([
      createInvitation(store, owner, "x@example.com", now),
      createInvitation(store, owner, "y@example.com", now),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([
      { ok: false, reason: "capacity-full" },
    ]);
  });
});
