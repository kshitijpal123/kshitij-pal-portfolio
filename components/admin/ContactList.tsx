import { Button } from "@/components/ui/Button";
import { Link } from "@/components/ui/Link";
import { deleteContactAction } from "@/lib/admin/actions";
import type { Contact } from "@/lib/admin/model";

/** The signed-in user's own contacts, each with edit and delete. */
export function ContactList({
  contacts,
  emptyMessage,
}: {
  contacts: Contact[];
  emptyMessage: string;
}) {
  if (contacts.length === 0) {
    return <p className="text-body-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <ul className="divide-y divide-border border-y border-border">
      {contacts.map((contact) => (
        <li
          key={contact.id}
          className="grid gap-3 py-4 sm:grid-cols-3 sm:items-center"
        >
          <div className="min-w-0 sm:col-span-2">
            <p className="font-medium break-words">{contact.name}</p>
            <p className="text-body-sm break-words text-muted-foreground">
              {contact.email}
              {contact.company && ` · ${contact.company}`}
            </p>
            {contact.notes && (
              <p className="mt-2 text-body-sm break-words whitespace-pre-line">
                {contact.notes}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-3 sm:justify-self-end">
            <Link
              href={`/admin/contacts?edit=${encodeURIComponent(contact.id)}`}
              className="inline-flex min-h-11 items-center text-body-sm"
            >
              Edit <span className="sr-only">{contact.name}</span>
            </Link>
            <form action={deleteContactAction}>
              <input type="hidden" name="contactId" value={contact.id} />
              <Button type="submit" variant="secondary">
                Delete <span className="sr-only">{contact.name}</span>
              </Button>
            </form>
          </div>
        </li>
      ))}
    </ul>
  );
}
