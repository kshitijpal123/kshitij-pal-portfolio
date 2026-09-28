"use client";

import { type FormEvent, useRef, useState } from "react";
import { ContactField } from "@/components/contact/ContactField";
import { Button } from "@/components/ui/Button";
import {
  type ContactFieldErrors,
  type ContactResponse,
  type ContactSubmission,
  type ContactField as Field,
  contactFields,
  contactLimits,
  honeypotField,
  validateContact,
  validateContactField,
} from "@/lib/contact/validation";

type Status = "idle" | "submitting" | "success" | "error";

const emptyValues: ContactSubmission = {
  name: "",
  email: "",
  subject: "",
  message: "",
};

const messages = {
  success: "Thanks — your message has been sent.",
  failed:
    "Something went wrong while sending your message. Please try again or use one of the direct contact links.",
  invalid: "Please check the highlighted fields and try again.",
  rateLimited:
    "You've sent several messages recently. Please try again later or use one of the direct contact links.",
};

async function readResponse(response: Response) {
  try {
    return (await response.json()) as ContactResponse;
  } catch {
    return null;
  }
}

/**
 * The contact form. Validation runs here for immediate feedback and again on
 * the server, which is authoritative. Values are kept after a failure and
 * cleared after a successful send.
 */
export function ContactForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const submittingRef = useRef(false);
  const [values, setValues] = useState<ContactSubmission>(emptyValues);
  const [honeypot, setHoneypot] = useState("");
  const [errors, setErrors] = useState<ContactFieldErrors>({});
  const [status, setStatus] = useState<Status>("idle");
  const [failure, setFailure] = useState(messages.failed);

  const submitting = status === "submitting";

  function setFieldError(name: Field, value: string) {
    setErrors((current) => ({
      ...current,
      [name]: validateContactField(name, value),
    }));
  }

  function handleChange(name: Field, value: string) {
    setValues((current) => ({ ...current, [name]: value }));
    if (errors[name]) setFieldError(name, value);
  }

  function handleBlur(name: Field) {
    if (values[name] !== "" || errors[name]) setFieldError(name, values[name]);
  }

  function focusField(name: Field) {
    const control = formRef.current?.elements.namedItem(name);
    if (control instanceof HTMLElement) control.focus();
  }

  function fail(message: string) {
    setFailure(message);
    setStatus("error");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) return;

    const result = validateContact(values);
    if (!result.success) {
      setErrors(result.errors);
      const first = contactFields.find((field) => result.errors[field]);
      if (first) focusField(first);
      return;
    }

    submittingRef.current = true;
    setErrors({});
    setStatus("submitting");

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...result.data, [honeypotField]: honeypot }),
      });
      const body = await readResponse(response);

      if (response.ok && body?.success) {
        setValues(emptyValues);
        setStatus("success");
      } else if (response.status === 429) {
        fail(messages.rateLimited);
      } else if (body && !body.success && body.fieldErrors) {
        setErrors(body.fieldErrors);
        fail(messages.invalid);
      } else {
        fail(messages.failed);
      }
    } catch {
      fail(messages.failed);
    } finally {
      submittingRef.current = false;
    }
  }

  return (
    <form
      ref={formRef}
      noValidate
      aria-labelledby="contact-form-heading"
      aria-busy={submitting || undefined}
      onSubmit={handleSubmit}
      className="relative grid gap-6"
    >
      <h2 id="contact-form-heading" className="text-h3">
        Send a message
      </h2>

      <div className="grid gap-6 sm:grid-cols-2">
        <ContactField
          name="name"
          label="Name"
          value={values.name}
          error={errors.name}
          maxLength={contactLimits.name.max}
          autoComplete="name"
          onChange={handleChange}
          onBlur={handleBlur}
        />
        <ContactField
          name="email"
          label="Email"
          type="email"
          value={values.email}
          error={errors.email}
          maxLength={contactLimits.email.max}
          autoComplete="email"
          onChange={handleChange}
          onBlur={handleBlur}
        />
      </div>
      <ContactField
        name="subject"
        label="Subject"
        value={values.subject}
        error={errors.subject}
        maxLength={contactLimits.subject.max}
        onChange={handleChange}
        onBlur={handleBlur}
      />
      <ContactField
        name="message"
        label="Message"
        type="textarea"
        value={values.message}
        error={errors.message}
        maxLength={contactLimits.message.max}
        onChange={handleChange}
        onBlur={handleBlur}
      />

      <div aria-hidden="true" className="sr-only">
        <label htmlFor="contact-website">Website</label>
        <input
          id="contact-website"
          name={honeypotField}
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={honeypot}
          onChange={(event) => setHoneypot(event.target.value)}
        />
      </div>

      <div>
        <Button
          type="submit"
          aria-disabled={submitting || undefined}
          className="w-full aria-disabled:cursor-progress aria-disabled:opacity-50 sm:w-auto"
        >
          {submitting ? "Sending…" : "Send message"}
        </Button>
        <div role="status" className="text-body-sm">
          {status === "success" && (
            <p className="mt-4 max-w-measure border-l-2 border-accent pl-3">
              {messages.success}
            </p>
          )}
        </div>
        <div role="alert" className="text-body-sm">
          {status === "error" && (
            <p className="mt-4 max-w-measure border-l-2 border-danger pl-3">
              {failure}
            </p>
          )}
        </div>
      </div>
    </form>
  );
}
