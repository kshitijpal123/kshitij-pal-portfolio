export const contactFields = ["name", "email", "subject", "message"] as const;

export type ContactField = (typeof contactFields)[number];

export type ContactSubmission = Record<ContactField, string>;

export type ContactFieldErrors = Partial<Record<ContactField, string>>;

/** The JSON body returned by `POST /api/contact`. */
export type ContactResponse =
  | { success: true }
  | { success: false; error: string; fieldErrors?: ContactFieldErrors };

/** Hidden field that people leave empty; a value marks the sender as a bot. */
export const honeypotField = "website";

export type ContactValidationResult =
  | { success: true; data: ContactSubmission }
  | { success: false; errors: ContactFieldErrors };

export const contactLimits = {
  name: { min: 1, max: 100 },
  email: { max: 254 },
  subject: { min: 1, max: 200 },
  message: { min: 10, max: 5000 },
} as const;

/** Deliberately permissive: one `@`, no whitespace, a dot in the domain. */
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Name, email, and subject are single-line; line breaks collapse to spaces. */
function normalizeLine(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function validateName(value: string) {
  if (value.length < contactLimits.name.min) return "Name is required.";
  if (value.length > contactLimits.name.max)
    return `Name must be at most ${contactLimits.name.max} characters.`;
  return undefined;
}

function validateEmail(value: string) {
  if (value.length === 0) return "Email is required.";
  if (value.length > contactLimits.email.max || !emailPattern.test(value))
    return "Enter a valid email address.";
  return undefined;
}

function validateSubject(value: string) {
  if (value.length < contactLimits.subject.min) return "Subject is required.";
  if (value.length > contactLimits.subject.max)
    return `Subject must be at most ${contactLimits.subject.max} characters.`;
  return undefined;
}

function validateMessage(value: string) {
  if (value.length === 0) return "Message is required.";
  if (value.length < contactLimits.message.min)
    return `Message must be at least ${contactLimits.message.min} characters.`;
  if (value.length > contactLimits.message.max)
    return `Message must be at most ${contactLimits.message.max.toLocaleString("en-US")} characters.`;
  return undefined;
}

const validators: Record<ContactField, (value: string) => string | undefined> =
  {
    name: validateName,
    email: validateEmail,
    subject: validateSubject,
    message: validateMessage,
  };

/** Trims (and, for single-line fields, collapses whitespace in) one value. */
export function normalizeContactField(field: ContactField, value: string) {
  return field === "message" ? value.trim() : normalizeLine(value);
}

/** The error for one field, or `undefined` when it is valid. */
export function validateContactField(field: ContactField, value: string) {
  return validators[field](normalizeContactField(field, value));
}

/**
 * Validates an untrusted payload. Shared by the form (immediate feedback) and
 * the API route, where it is authoritative. Unknown keys are dropped.
 */
export function validateContact(input: unknown): ContactValidationResult {
  const record =
    typeof input === "object" && input !== null && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};

  const data = {} as ContactSubmission;
  const errors: ContactFieldErrors = {};

  for (const field of contactFields) {
    const value = normalizeContactField(field, asString(record[field]));
    data[field] = value;
    const error = validators[field](value);
    if (error) errors[field] = error;
  }

  return Object.keys(errors).length === 0
    ? { success: true, data }
    : { success: false, errors };
}
