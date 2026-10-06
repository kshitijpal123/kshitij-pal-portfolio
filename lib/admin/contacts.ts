import type { Contact, PublicUser } from "@/lib/admin/model";
import { getUserSettings } from "@/lib/admin/settings";
import type { AdminStore } from "@/lib/admin/store";
import type { ContactInput } from "@/lib/admin/validation";

/*
 * Contacts always belong to the signed-in user: the store addresses them by
 * the actor's ID, so another user's contact is simply not found. They are
 * never shared.
 */

/** A storage bound, not a security limit; checked before each create. */
export const maxContactsPerUser = 1000;

const byName = (a: Contact, b: Contact) =>
  a.name.localeCompare(b.name) || a.email.localeCompare(b.email);

async function contactsEnabled(store: AdminStore, actor: PublicUser) {
  return (await getUserSettings(store, actor.id)).contactsEnabled;
}

/** The actor's own contacts by name, optionally filtered by `query`. */
export async function listOwnContacts(
  store: AdminStore,
  actor: PublicUser,
  query = "",
) {
  const needle = query.trim().toLowerCase();
  const contacts = (await store.listContacts(actor.id)).sort(byName);
  if (!needle) return contacts;
  return contacts.filter((contact) =>
    [contact.name, contact.email, contact.company ?? ""].some((value) =>
      value.toLowerCase().includes(needle),
    ),
  );
}

export async function getOwnContact(
  store: AdminStore,
  actor: PublicUser,
  contactId: string,
) {
  return contactId ? store.getContact(actor.id, contactId) : null;
}

export type ContactOutcome =
  "saved" | "duplicate" | "not-found" | "disabled" | "limit";

export async function createContact(
  store: AdminStore,
  actor: PublicUser,
  input: ContactInput,
  now: Date,
): Promise<ContactOutcome> {
  if (!(await contactsEnabled(store, actor))) return "disabled";
  if ((await store.listContacts(actor.id)).length >= maxContactsPerUser) {
    return "limit";
  }
  const at = now.toISOString();
  return store.createContact({
    ...input,
    id: crypto.randomUUID(),
    userId: actor.id,
    createdAt: at,
    updatedAt: at,
  });
}

export async function updateContact(
  store: AdminStore,
  actor: PublicUser,
  contactId: string,
  input: ContactInput,
  now: Date,
): Promise<ContactOutcome> {
  if (!(await contactsEnabled(store, actor))) return "disabled";
  const existing = await getOwnContact(store, actor, contactId);
  if (!existing) return "not-found";
  return store.updateContact(
    {
      ...existing,
      ...input,
      id: existing.id,
      userId: actor.id,
      updatedAt: now.toISOString(),
    },
    existing.email,
  );
}

export async function deleteContact(
  store: AdminStore,
  actor: PublicUser,
  contactId: string,
): Promise<"deleted" | "not-found" | "disabled"> {
  if (!(await contactsEnabled(store, actor))) return "disabled";
  const existing = await getOwnContact(store, actor, contactId);
  if (!existing) return "not-found";
  return (await store.deleteContact(actor.id, existing.id, existing.email))
    ? "deleted"
    : "not-found";
}
