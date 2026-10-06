"use client";

import {
  type FormEvent,
  startTransition,
  useActionState,
  useState,
} from "react";
import { controlClassName } from "@/components/admin/AdminField";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { sendEmailAction } from "@/lib/admin/actions";
import type { ComposeState } from "@/lib/admin/formState";
import type { Contact, EmailTemplate } from "@/lib/admin/model";
import { personalize } from "@/lib/admin/personalization";
import {
  adminLimits,
  describePlaceholderProblem,
  normalizeEmail,
} from "@/lib/admin/validation";

export type ComposeSender = { id: string; email: string };
export type ComposeContact = Pick<Contact, "id" | "name" | "email" | "company">;
export type ComposeTemplate = Pick<
  EmailTemplate,
  "id" | "name" | "subject" | "body"
>;

type ComposeFormProps = {
  operationId: string;
  senders: ComposeSender[];
  contacts: ComposeContact[];
  templates: ComposeTemplate[];
  bulkEnabled: boolean;
  maxRecipients: number;
};

function FieldError({ id, error }: { id: string; error?: string }) {
  return error ? (
    <p id={id} className="mt-2 text-body-sm text-danger">
      {error}
    </p>
  ) : null;
}

function splitEmails(value: string) {
  return value
    .split(/[\s,;]+/)
    .map(normalizeEmail)
    .filter(Boolean);
}

type FieldsProps = Omit<ComposeFormProps, "operationId"> & {
  errors: ComposeState["fieldErrors"];
};

/**
 * The editable draft. Remounted (cleared) only after a fully successful
 * send; after an error or partial failure the draft stays as it was.
 */
function ComposeFields({
  senders,
  contacts,
  templates,
  bulkEnabled,
  maxRecipients,
  errors,
}: FieldsProps) {
  const [senderId, setSenderId] = useState(senders[0]?.id ?? "");
  const [templateId, setTemplateId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const [emails, setEmails] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const chosenContacts = contacts.filter((contact) =>
    selected.includes(contact.id),
  );
  const typed = splitEmails(emails);
  const recipientCount = new Set([
    ...chosenContacts.map((contact) => contact.email),
    ...typed,
  ]).size;
  const needle = filter.trim().toLowerCase();
  const visibleContacts = needle
    ? contacts.filter((contact) =>
        `${contact.name} ${contact.email} ${contact.company ?? ""}`
          .toLowerCase()
          .includes(needle),
      )
    : contacts;

  const previewContact =
    chosenContacts[0] ??
    contacts.find((contact) => contact.email === typed[0]) ??
    null;
  const previewEmail = previewContact?.email ?? typed[0] ?? null;
  const values = {
    name: previewContact?.name ?? null,
    email: previewEmail,
    company: previewContact?.company ?? null,
  };
  const previewSubject = personalize(subject, values);
  const previewBody = personalize(body, values);
  const previewProblem = !previewSubject.ok
    ? previewSubject.problem
    : !previewBody.ok
      ? previewBody.problem
      : null;

  function chooseTemplate(id: string) {
    setTemplateId(id);
    const template = templates.find((candidate) => candidate.id === id);
    if (template) {
      setSubject(template.subject);
      setBody(template.body);
    }
  }

  function toggle(id: string, checked: boolean) {
    setSelected((current) =>
      checked ? [...current, id] : current.filter((value) => value !== id),
    );
  }

  return (
    <div className="grid gap-6">
      <div>
        <label
          htmlFor="compose-sender"
          className="block text-body-sm font-medium"
        >
          From
        </label>
        <p
          id="compose-sender-hint"
          className="mt-1 text-body-sm text-muted-foreground"
        >
          Only your approved addresses with a working Gmail connection.
        </p>
        <select
          id="compose-sender"
          name="senderIdentityId"
          value={senderId}
          onChange={(event) => setSenderId(event.target.value)}
          aria-describedby="compose-sender-hint compose-sender-error"
          aria-invalid={errors?.senderIdentityId ? true : undefined}
          className={controlClassName}
        >
          {senders.map((sender) => (
            <option key={sender.id} value={sender.id}>
              {sender.email}
            </option>
          ))}
        </select>
        <FieldError
          id="compose-sender-error"
          error={errors?.senderIdentityId}
        />
      </div>

      {templates.length > 0 && (
        <div>
          <label
            htmlFor="compose-template"
            className="block text-body-sm font-medium"
          >
            Template (optional)
          </label>
          <select
            id="compose-template"
            name="templateId"
            value={templateId}
            onChange={(event) => chooseTemplate(event.target.value)}
            className={controlClassName}
          >
            <option value="">No template</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <fieldset aria-describedby="compose-recipients-error">
        <legend className="text-body-sm font-medium">Recipients</legend>
        <p className="mt-1 text-body-sm text-muted-foreground">
          {bulkEnabled
            ? `Each recipient gets their own message; no one sees the others. Up to ${maxRecipients} per send.`
            : "One recipient per send for your account."}
        </p>
        {selected.map((id) => (
          <input key={id} type="hidden" name="contactId" value={id} />
        ))}
        {contacts.length > 0 && (
          <div className="mt-3">
            <label
              htmlFor="compose-contact-filter"
              className="block text-body-sm font-medium"
            >
              Filter contacts
            </label>
            <input
              id="compose-contact-filter"
              type="search"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              className={controlClassName}
            />
            <ul className="mt-3 max-h-64 divide-y divide-border overflow-y-auto border-y border-border">
              {visibleContacts.map((contact) => (
                <li key={contact.id}>
                  <label className="flex min-h-11 items-center gap-3 py-2 text-body-sm">
                    <input
                      type="checkbox"
                      checked={selected.includes(contact.id)}
                      onChange={(event) =>
                        toggle(contact.id, event.target.checked)
                      }
                      className="size-4"
                    />
                    <span className="min-w-0 break-words">
                      {contact.name}{" "}
                      <span className="text-muted-foreground">
                        {contact.email}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-3">
          <label
            htmlFor="compose-emails"
            className="block text-body-sm font-medium"
          >
            Other addresses (optional)
          </label>
          <p
            id="compose-emails-hint"
            className="mt-1 text-body-sm text-muted-foreground"
          >
            Separate with commas or new lines. Only {"{{email}}"} can be filled
            for an address that is not a contact.
          </p>
          <textarea
            id="compose-emails"
            name="emails"
            rows={2}
            value={emails}
            onChange={(event) => setEmails(event.target.value)}
            aria-describedby="compose-emails-hint"
            className={controlClassName}
          />
        </div>
        <p className="mt-2 text-body-sm" aria-live="polite">
          {recipientCount} {recipientCount === 1 ? "recipient" : "recipients"}{" "}
          selected.
        </p>
        <FieldError id="compose-recipients-error" error={errors?.recipients} />
      </fieldset>

      <div>
        <label
          htmlFor="compose-subject"
          className="block text-body-sm font-medium"
        >
          Subject
        </label>
        <input
          id="compose-subject"
          name="subject"
          type="text"
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          maxLength={adminLimits.subject.max}
          aria-invalid={errors?.subject ? true : undefined}
          aria-describedby="compose-subject-error"
          className={controlClassName}
        />
        <FieldError id="compose-subject-error" error={errors?.subject} />
      </div>

      <div>
        <label
          htmlFor="compose-body"
          className="block text-body-sm font-medium"
        >
          Message
        </label>
        <p
          id="compose-body-hint"
          className="mt-1 text-body-sm text-muted-foreground"
        >
          Plain text. Placeholders: {"{{name}}"}, {"{{email}}"}, {"{{company}}"}
          .
        </p>
        <textarea
          id="compose-body"
          name="body"
          rows={10}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          maxLength={adminLimits.body.max}
          aria-invalid={errors?.body ? true : undefined}
          aria-describedby="compose-body-hint compose-body-error"
          className={controlClassName}
        />
        <FieldError id="compose-body-error" error={errors?.body} />
      </div>

      <section
        aria-labelledby="compose-preview-heading"
        className="border-l-2 border-border-strong pl-4"
      >
        <h3 id="compose-preview-heading" className="text-body font-medium">
          Preview
          {previewEmail && (
            <span className="font-normal text-muted-foreground">
              {" "}
              for {previewEmail}
            </span>
          )}
        </h3>
        {!previewEmail ? (
          <p className="mt-2 text-body-sm text-muted-foreground">
            Choose a recipient to preview their message.
          </p>
        ) : previewProblem ? (
          <p className="mt-2 text-body-sm text-danger">
            {describePlaceholderProblem(previewProblem)}
          </p>
        ) : previewSubject.ok && previewBody.ok ? (
          <div className="mt-2 text-body-sm">
            <p className="font-medium break-words">{previewSubject.text}</p>
            <p className="mt-2 break-words whitespace-pre-line">
              {previewBody.text}
            </p>
          </div>
        ) : null}
      </section>
    </div>
  );
}

/**
 * Compose and send. The browser submits only IDs, addresses, and text; the
 * server decides the sender, recipients, personalization, and limits again.
 */
export function ComposeForm({ operationId, ...props }: ComposeFormProps) {
  const [state, action, pending] = useActionState(sendEmailAction, {
    status: "idle",
    operationId,
  } satisfies ComposeState);

  // Submitted without React's automatic form reset, so a draft survives a
  // refused or partly failed send.
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    startTransition(() => action(data));
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-busy={pending || undefined}
      className="grid gap-6"
    >
      <input type="hidden" name="operationId" value={state.operationId} />
      <ComposeFields
        key={state.operationId}
        {...props}
        errors={state.fieldErrors}
      />
      <div>
        <SubmitButton pending={pending} pendingLabel="Sending…">
          Send
        </SubmitButton>
        <div role="status" className="text-body-sm">
          {state.status === "success" && state.message && (
            <p className="mt-4 max-w-measure border-l-2 border-accent pl-3">
              {state.message}
            </p>
          )}
        </div>
        <div role="alert" className="text-body-sm">
          {state.status === "error" && state.message && (
            <p className="mt-4 max-w-measure border-l-2 border-danger pl-3">
              {state.message}
            </p>
          )}
        </div>
        {state.results && state.results.length > 0 && (
          <ul
            aria-label="Send results"
            className="mt-4 divide-y divide-border border-y border-border"
          >
            {state.results.map((result) => (
              <li key={result.email} className="grid gap-1 py-3 text-body-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium break-words">
                    {result.email}
                  </span>
                  <StatusBadge value={result.status} />
                </div>
                <p className="text-muted-foreground">{result.message}</p>
              </li>
            ))}
          </ul>
        )}
        {state.status === "error" && state.results && (
          <p className="mt-4 text-body-sm text-muted-foreground">
            To send a fresh copy to everyone anyway,{" "}
            <a href="/admin/compose" className="text-accent underline">
              start a new message
            </a>
            .
          </p>
        )}
      </div>
    </form>
  );
}
