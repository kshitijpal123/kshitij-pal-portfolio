"use client";

import { useActionState } from "react";
import { AdminField } from "@/components/admin/AdminField";
import { FormStatus } from "@/components/admin/FormStatus";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { saveContactAction } from "@/lib/admin/actions";
import { idleFormState } from "@/lib/admin/formState";
import type { Contact } from "@/lib/admin/model";
import { adminLimits } from "@/lib/admin/validation";

type ContactFormProps = {
  /** Editing this contact; omitted to add a new one. */
  contact?: Pick<Contact, "id" | "name" | "email" | "company" | "notes">;
};

/** Adds or edits one of the signed-in user's own contacts. */
export function ContactForm({ contact }: ContactFormProps) {
  const [state, action, pending] = useActionState(
    saveContactAction,
    idleFormState,
  );
  const value = (field: "name" | "email" | "company" | "notes") =>
    state.values?.[field] ?? contact?.[field] ?? undefined;

  return (
    <form
      action={action}
      noValidate
      aria-busy={pending || undefined}
      onSubmit={(event) => pending && event.preventDefault()}
      className="grid gap-6"
    >
      {contact && <input type="hidden" name="contactId" value={contact.id} />}
      <AdminField
        name="name"
        label="Name"
        autoComplete="off"
        maxLength={adminLimits.name.max}
        defaultValue={value("name")}
        error={state.fieldErrors?.name}
      />
      <AdminField
        name="email"
        type="email"
        label="Email"
        autoComplete="off"
        maxLength={adminLimits.email.max}
        defaultValue={value("email")}
        error={state.fieldErrors?.email}
      />
      <AdminField
        name="company"
        label="Company (optional)"
        autoComplete="off"
        required={false}
        maxLength={adminLimits.company.max}
        defaultValue={value("company")}
        error={state.fieldErrors?.company}
      />
      <AdminField
        name="notes"
        label="Notes (optional)"
        hint="Private to you; never sent."
        required={false}
        rows={3}
        maxLength={adminLimits.notes.max}
        defaultValue={value("notes")}
        error={state.fieldErrors?.notes}
      />
      <div>
        <SubmitButton pending={pending} pendingLabel="Saving…">
          {contact ? "Save contact" : "Add contact"}
        </SubmitButton>
        <FormStatus state={state} />
      </div>
    </form>
  );
}
