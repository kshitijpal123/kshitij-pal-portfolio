"use client";

import { useActionState } from "react";
import { AdminField } from "@/components/admin/AdminField";
import { FormStatus } from "@/components/admin/FormStatus";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { saveTemplateAction } from "@/lib/admin/actions";
import { idleFormState } from "@/lib/admin/formState";
import type { EmailTemplate } from "@/lib/admin/model";
import { adminLimits } from "@/lib/admin/validation";

type TemplateFormProps = {
  /** Editing this template; omitted to create a new one. */
  template?: Pick<EmailTemplate, "id" | "name" | "subject" | "body">;
};

const placeholderHint =
  "Plain text. Placeholders: {{name}}, {{email}}, {{company}}. Anything else in double braces is refused.";

/** Creates or edits one of the signed-in user's own templates. */
export function TemplateForm({ template }: TemplateFormProps) {
  const [state, action, pending] = useActionState(
    saveTemplateAction,
    idleFormState,
  );
  const value = (field: "name" | "subject" | "body") =>
    state.values?.[field] ?? template?.[field];

  return (
    <form
      action={action}
      noValidate
      aria-busy={pending || undefined}
      onSubmit={(event) => pending && event.preventDefault()}
      className="grid gap-6"
    >
      {template && (
        <input type="hidden" name="templateId" value={template.id} />
      )}
      <AdminField
        name="name"
        label="Template name"
        hint="Only you see this."
        autoComplete="off"
        maxLength={adminLimits.name.max}
        defaultValue={value("name")}
        error={state.fieldErrors?.name}
      />
      <AdminField
        name="subject"
        label="Subject"
        autoComplete="off"
        maxLength={adminLimits.subject.max}
        defaultValue={value("subject")}
        error={state.fieldErrors?.subject}
      />
      <AdminField
        name="body"
        label="Message"
        hint={placeholderHint}
        rows={10}
        maxLength={adminLimits.body.max}
        defaultValue={value("body")}
        error={state.fieldErrors?.body}
      />
      <div>
        <SubmitButton pending={pending} pendingLabel="Saving…">
          {template ? "Save template" : "Create template"}
        </SubmitButton>
        <FormStatus state={state} />
      </div>
    </form>
  );
}
