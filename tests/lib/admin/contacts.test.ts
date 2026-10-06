// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  createContact,
  deleteContact,
  getOwnContact,
  listOwnContacts,
  updateContact,
} from "@/lib/admin/contacts";
import { updateUserSettings } from "@/lib/admin/settings";
import { validateContact, type ContactInput } from "@/lib/admin/validation";
import { defaultUserSettings } from "@/lib/admin/settings";
import { later, now, seedOwner, seedUser } from "@/tests/helpers/admin";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.append(key, value);
  return data;
}

const rahul: ContactInput = {
  name: "Rahul",
  email: "rahul@example.com",
  company: "Acme",
  notes: null,
};

async function setup() {
  const { store, owner } = await seedOwner();
  const alice = (await seedUser(store, owner, "alice@example.com")).user;
  const bob = (await seedUser(store, owner, "bob@example.com")).user;
  return { store, owner, alice, bob };
}

describe("validateContact", () => {
  it("normalizes the email and single-line fields", () => {
    expect(
      validateContact(
        form({
          name: "  Rahul   Sharma ",
          email: " Rahul@Example.COM ",
          company: " Acme\nCorp ",
          notes: " line one\r\nline two ",
        }),
      ),
    ).toEqual({
      success: true,
      data: {
        name: "Rahul Sharma",
        email: "rahul@example.com",
        company: "Acme Corp",
        notes: "line one\nline two",
      },
    });
  });

  it("requires a name and a header-safe email", () => {
    const result = validateContact(
      form({ name: "", email: "a,b@example.com" }),
    );
    expect(result).toEqual({
      success: false,
      errors: {
        name: "Name is required.",
        email: "Enter a valid email address.",
      },
    });
    for (const email of [
      "",
      "no-at-sign",
      "Rahul <rahul@example.com>",
      "rahul@example.com\r\nBcc: x@y.co",
      "rahul@localhost",
    ]) {
      expect(validateContact(form({ name: "R", email })).success, email).toBe(
        false,
      );
    }
  });

  it("bounds company and notes", () => {
    const result = validateContact(
      form({
        name: "R",
        email: "r@example.com",
        company: "c".repeat(101),
        notes: "n".repeat(1001),
      }),
    );
    expect(result.success).toBe(false);
  });
});

describe("contacts", () => {
  it("creates, lists, updates, and deletes the user's own contacts", async () => {
    const { store, alice } = await setup();
    expect(await createContact(store, alice, rahul, now)).toBe("saved");
    expect(
      await createContact(
        store,
        alice,
        { ...rahul, name: "Asha", email: "asha@example.com", company: null },
        now,
      ),
    ).toBe("saved");

    const listed = await listOwnContacts(store, alice);
    expect(listed.map((contact) => contact.name)).toEqual(["Asha", "Rahul"]);
    expect(listed[1]).toMatchObject({ userId: alice.id, ...rahul });
    expect(
      (await listOwnContacts(store, alice, "ACME")).map((c) => c.name),
    ).toEqual(["Rahul"]);

    const id = listed[1].id;
    expect(
      await updateContact(
        store,
        alice,
        id,
        { ...rahul, email: "rahul@acme.example" },
        later(1000),
      ),
    ).toBe("saved");
    expect(await getOwnContact(store, alice, id)).toMatchObject({
      email: "rahul@acme.example",
      createdAt: now.toISOString(),
      updatedAt: later(1000).toISOString(),
    });
    // The old address is free again.
    expect(await createContact(store, alice, rahul, now)).toBe("saved");

    expect(await deleteContact(store, alice, id)).toBe("deleted");
    expect(await getOwnContact(store, alice, id)).toBeNull();
    expect(await deleteContact(store, alice, id)).toBe("not-found");
  });

  it("refuses a duplicate email for the same user, after normalization", async () => {
    const { store, alice } = await setup();
    await createContact(store, alice, rahul, now);
    const duplicate = validateContact(
      form({ name: "Other", email: "  RAHUL@example.com " }),
    );
    if (!duplicate.success) throw new Error("setup");
    expect(await createContact(store, alice, duplicate.data, now)).toBe(
      "duplicate",
    );

    await createContact(
      store,
      alice,
      { ...rahul, email: "asha@example.com" },
      now,
    );
    const asha = (await listOwnContacts(store, alice)).find(
      (contact) => contact.email === "asha@example.com",
    );
    expect(await updateContact(store, alice, asha?.id ?? "", rahul, now)).toBe(
      "duplicate",
    );
  });

  it("isolates users: the same email is separate, and others' contacts are unreachable", async () => {
    const { store, alice, bob } = await setup();
    await createContact(store, alice, rahul, now);
    expect(await createContact(store, bob, rahul, now)).toBe("saved");

    const [aliceContact] = await listOwnContacts(store, alice);
    expect(await listOwnContacts(store, bob)).toHaveLength(1);
    expect(await getOwnContact(store, bob, aliceContact.id)).toBeNull();
    expect(
      await updateContact(
        store,
        bob,
        aliceContact.id,
        { ...rahul, name: "Hijacked" },
        now,
      ),
    ).toBe("not-found");
    expect(await deleteContact(store, bob, aliceContact.id)).toBe("not-found");
    expect(await getOwnContact(store, alice, aliceContact.id)).toMatchObject({
      name: "Rahul",
    });
  });

  it("assigns new contacts to the actor whatever the input holds", async () => {
    const { store, alice, bob } = await setup();
    await createContact(
      store,
      alice,
      { ...rahul, userId: bob.id } as ContactInput,
      now,
    );
    expect(await listOwnContacts(store, bob)).toEqual([]);
    expect((await listOwnContacts(store, alice))[0].userId).toBe(alice.id);
  });

  it("refuses every operation while contacts are turned off", async () => {
    const { store, owner, alice } = await setup();
    await createContact(store, alice, rahul, now);
    const [contact] = await listOwnContacts(store, alice);
    await updateUserSettings(
      store,
      owner,
      alice.id,
      { ...defaultUserSettings, contactsEnabled: false },
      now,
    );

    expect(await createContact(store, alice, rahul, now)).toBe("disabled");
    expect(await updateContact(store, alice, contact.id, rahul, now)).toBe(
      "disabled",
    );
    expect(await deleteContact(store, alice, contact.id)).toBe("disabled");
  });
});
