// @vitest-environment node
import { describe, expect, it } from "vitest";
import { getUserAdministration, setUserStatus } from "@/lib/admin/users";
import { now, seedOwner, seedUser } from "@/tests/helpers/admin";

describe("user administration", () => {
  it("gives the OWNER every user without password hashes", async () => {
    const { store, owner } = await seedOwner();
    await seedUser(store, owner, "friend@example.com");

    const admin = await getUserAdministration(store, owner, now);
    expect(admin?.users.map((user) => user.email)).toEqual([
      "owner@example.com",
      "friend@example.com",
    ]);
    expect(JSON.stringify(admin)).not.toMatch(/passwordHash|argon2|tokenHash/);
  });

  it("gives a USER nothing", async () => {
    const { store, owner } = await seedOwner();
    const { user } = await seedUser(store, owner, "friend@example.com");
    expect(await getUserAdministration(store, user, now)).toBeNull();
  });

  it("lets the OWNER disable and re-enable a USER", async () => {
    const { store, owner } = await seedOwner();
    const { user } = await seedUser(store, owner, "friend@example.com");

    expect(await setUserStatus(store, owner, user.id, "DISABLED", now)).toBe(
      true,
    );
    expect((await store.getUserById(user.id))?.status).toBe("DISABLED");
    expect(await setUserStatus(store, owner, user.id, "ACTIVE", now)).toBe(
      true,
    );
    expect((await store.getUserById(user.id))?.status).toBe("ACTIVE");
  });

  it("never disables the OWNER", async () => {
    const { store, owner } = await seedOwner();
    expect(await setUserStatus(store, owner, owner.id, "DISABLED", now)).toBe(
      false,
    );
    expect(
      await store.setUserStatus(owner.id, "DISABLED", now.toISOString()),
    ).toBe(false);
    expect((await store.getUserById(owner.id))?.status).toBe("ACTIVE");
  });

  it("does not let a USER change anyone's status", async () => {
    const { store, owner } = await seedOwner();
    const { user: a } = await seedUser(store, owner, "a@example.com");
    const { user: b } = await seedUser(store, owner, "b@example.com");

    expect(await setUserStatus(store, a, b.id, "DISABLED", now)).toBe(false);
    expect(await setUserStatus(store, a, owner.id, "DISABLED", now)).toBe(
      false,
    );
    expect((await store.getUserById(b.id))?.status).toBe("ACTIVE");
  });
});
