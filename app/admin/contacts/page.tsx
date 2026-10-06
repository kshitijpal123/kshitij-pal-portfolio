import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/AdminShell";
import { ContactForm } from "@/components/admin/ContactForm";
import { ContactList } from "@/components/admin/ContactList";
import { PageHeading } from "@/components/admin/PageHeading";
import { Button } from "@/components/ui/Button";
import { Link } from "@/components/ui/Link";
import { getOwnContact, listOwnContacts } from "@/lib/admin/contacts";
import { getAdminStore } from "@/lib/admin/getAdminStore";
import { requireUser } from "@/lib/admin/session";
import { getUserSettings } from "@/lib/admin/settings";

export const metadata: Metadata = { title: "Contacts" };

function param(value: string | string[] | undefined, max = 100) {
  return typeof value === "string" ? value.slice(0, max) : "";
}

export default async function ContactsPage({
  searchParams,
}: PageProps<"/admin/contacts">) {
  const user = await requireUser();
  const store = getAdminStore();
  const [query, settings] = await Promise.all([
    searchParams,
    getUserSettings(store, user.id),
  ]);

  if (!settings.contactsEnabled) {
    return (
      <AdminShell user={user} current="contacts">
        <PageHeading title="Contacts">
          <p>Contacts are turned off for your account by the owner.</p>
        </PageHeading>
      </AdminShell>
    );
  }

  const search = param(query.q).trim();
  const editId = param(query.edit);
  const [contacts, editing] = await Promise.all([
    listOwnContacts(store, user, search),
    editId ? getOwnContact(store, user, editId) : null,
  ]);

  return (
    <AdminShell user={user} current="contacts">
      <div className="grid gap-12">
        <PageHeading title="Contacts">
          <p>
            People you send to. Only you can see your contacts. Their name,
            email, and company fill the {"{{name}}"}, {"{{email}}"}, and{" "}
            {"{{company}}"} placeholders when you compose.
          </p>
        </PageHeading>

        <section aria-labelledby="contact-form-heading">
          <h2 id="contact-form-heading" className="text-h3">
            {editing ? `Edit ${editing.name}` : "Add a contact"}
          </h2>
          <div className="mt-4 max-w-measure">
            <ContactForm
              key={editing?.id ?? "new"}
              contact={editing ?? undefined}
            />
            {editing && (
              <p className="mt-4 text-body-sm">
                <Link href="/admin/contacts">Cancel editing</Link>
              </p>
            )}
          </div>
        </section>

        <section aria-labelledby="contacts-heading">
          <h2 id="contacts-heading" className="text-h3">
            Your contacts
          </h2>
          <form
            role="search"
            action="/admin/contacts"
            className="mt-4 flex max-w-measure flex-wrap items-end gap-3"
          >
            <div className="min-w-0 flex-1">
              <label
                htmlFor="contact-search"
                className="block text-body-sm font-medium"
              >
                Search contacts
              </label>
              <input
                id="contact-search"
                name="q"
                type="search"
                defaultValue={search}
                maxLength={100}
                className="mt-2 block min-h-11 w-full rounded-control border border-border-strong bg-surface px-3 py-2 text-body text-foreground transition-colors hover:border-foreground"
              />
            </div>
            <Button type="submit" variant="secondary">
              Search
            </Button>
          </form>
          <div className="mt-6">
            <ContactList
              contacts={contacts}
              emptyMessage={
                search ? "No contacts match this search." : "No contacts yet."
              }
            />
          </div>
        </section>
      </div>
    </AdminShell>
  );
}
