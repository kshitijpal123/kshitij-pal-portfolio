import {
  findTemplateProblem,
  type PlaceholderProblem,
} from "@/lib/admin/personalization";

export const adminLimits = {
  email: { max: 254 },
  name: { min: 1, max: 100 },
  password: { min: 12, max: 128 },
  rejectionReason: { max: 500 },
  company: { max: 100 },
  notes: { max: 1000 },
  subject: { max: 250 },
  body: { max: 20000 },
  /** Addresses and contacts in one compose request, before deduplication. */
  recipientInputs: { max: 100 },
} as const;

export type FieldErrors<Field extends string> = Partial<Record<Field, string>>;

export type ValidationResult<Field extends string, Data> =
  | { success: true; data: Data }
  | { success: false; errors: FieldErrors<Field> };

/** Same permissive shape as the contact form: one `@`, a dot in the domain. */
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The one canonical form of an address, used for every lookup and key. */
export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function normalizeLine(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

/** A string field from untrusted input; anything else becomes "". */
export function readField(input: FormData, name: string) {
  const value = input.get(name);
  return typeof value === "string" ? value : "";
}

export function validateEmail(value: string) {
  if (value.length === 0) return "Email is required.";
  if (value.length > adminLimits.email.max || !emailPattern.test(value))
    return "Enter a valid email address.";
  return undefined;
}

function validateName(value: string) {
  if (value.length < adminLimits.name.min) return "Name is required.";
  if (value.length > adminLimits.name.max)
    return `Name must be at most ${adminLimits.name.max} characters.`;
  return undefined;
}

/** Length only, as NIST SP 800-63B recommends; no composition rules. */
function validateNewPassword(value: string) {
  if (value.length < adminLimits.password.min)
    return `Password must be at least ${adminLimits.password.min} characters.`;
  if (value.length > adminLimits.password.max)
    return `Password must be at most ${adminLimits.password.max} characters.`;
  return undefined;
}

function finish<Field extends string, Data>(
  data: Data,
  errors: FieldErrors<Field>,
): ValidationResult<Field, Data> {
  return Object.values(errors).some(Boolean)
    ? { success: false, errors }
    : { success: true, data };
}

export type Credentials = { email: string; password: string };

/** Login checks presence and size only; it never reveals password rules. */
export function validateLogin(input: FormData) {
  const email = normalizeEmail(readField(input, "email"));
  const password = readField(input, "password");
  const errors: FieldErrors<"email" | "password"> = {};
  if (!email || email.length > adminLimits.email.max)
    errors.email = "Enter your email address.";
  if (!password || password.length > adminLimits.password.max)
    errors.password = "Enter your password.";
  return finish<"email" | "password", Credentials>({ email, password }, errors);
}

export type NewAccount = { name: string; password: string };

type NewAccountField = "name" | "password" | "confirmPassword";

export function validateNewAccount(input: FormData) {
  const name = normalizeLine(readField(input, "name"));
  const password = readField(input, "password");
  const confirm = readField(input, "confirmPassword");
  const errors: FieldErrors<NewAccountField> = {
    name: validateName(name),
    password: validateNewPassword(password),
  };
  if (!errors.password && password !== confirm)
    errors.confirmPassword = "Passwords do not match.";
  return finish<NewAccountField, NewAccount>({ name, password }, errors);
}

export type OwnerSetup = NewAccount & { email: string; setupToken: string };

type OwnerSetupField = NewAccountField | "email" | "setupToken";

export function validateOwnerSetup(input: FormData) {
  const account = validateNewAccount(input);
  const email = normalizeEmail(readField(input, "email"));
  const setupToken = readField(input, "setupToken").trim();
  const errors: FieldErrors<OwnerSetupField> = {
    ...(account.success ? {} : account.errors),
    email: validateEmail(email),
    setupToken: setupToken ? undefined : "Setup token is required.",
  };
  return account.success
    ? finish<OwnerSetupField, OwnerSetup>(
        { ...account.data, email, setupToken },
        errors,
      )
    : ({ success: false, errors } as const);
}

export function validateEmailField(input: FormData) {
  const email = normalizeEmail(readField(input, "email"));
  return finish<"email", { email: string }>(
    { email },
    { email: validateEmail(email) },
  );
}

/*
 * Addresses that end up in a message header (contacts and recipients) use a
 * stricter, ASCII-only shape: the RFC 5322 dot-atom characters in the local
 * part and DNS labels in the domain. Commas, angle brackets, quotes, spaces,
 * and line breaks can never appear, so an address cannot add a recipient or
 * a header.
 */
const headerSafeEmailPattern =
  /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

export function isHeaderSafeEmail(value: string) {
  return (
    value.length <= adminLimits.email.max && headerSafeEmailPattern.test(value)
  );
}

function validateRecipientEmail(value: string) {
  if (value.length === 0) return "Email is required.";
  if (!isHeaderSafeEmail(value)) return "Enter a valid email address.";
  return undefined;
}

/** Any control character, including CR and LF. */
const controlCharacters = /[\u0000-\u001f\u007f]/;

export function hasControlCharacters(value: string) {
  return controlCharacters.test(value);
}

/** Multi-line text: unified to LF line breaks and trimmed. */
function normalizeText(value: string) {
  return value.replace(/\r\n?/g, "\n").trim();
}

function optionalLine(value: string, max: number, label: string) {
  const line = normalizeLine(value);
  return {
    value: line || null,
    error:
      line.length > max
        ? `${label} must be at most ${max} characters.`
        : undefined,
  };
}

export type ContactInput = {
  name: string;
  email: string;
  company: string | null;
  notes: string | null;
};

type ContactField = "name" | "email" | "company" | "notes";

export function validateContact(input: FormData) {
  const name = normalizeLine(readField(input, "name"));
  const email = normalizeEmail(readField(input, "email"));
  const company = optionalLine(
    readField(input, "company"),
    adminLimits.company.max,
    "Company",
  );
  const notes = normalizeText(readField(input, "notes"));
  const errors: FieldErrors<ContactField> = {
    name: validateName(name),
    email: validateRecipientEmail(email),
    company: company.error,
    notes:
      notes.length > adminLimits.notes.max
        ? `Notes must be at most ${adminLimits.notes.max} characters.`
        : undefined,
  };
  return finish<ContactField, ContactInput>(
    { name, email, company: company.value, notes: notes || null },
    errors,
  );
}

/** A user-facing description of a template placeholder problem. */
export function describePlaceholderProblem(problem: PlaceholderProblem) {
  switch (problem.kind) {
    case "unknown":
      return `${problem.placeholder} is not a supported placeholder. Use {{name}}, {{email}}, or {{company}}.`;
    case "malformed":
      return "Placeholders must look like {{name}}, with matching double braces.";
    case "missing":
      return `${problem.placeholder} has no value for ${problem.recipient ?? "this recipient"}.`;
  }
}

function validateSubject(value: string) {
  if (value.length === 0) return "Subject is required.";
  if (value.length > adminLimits.subject.max)
    return `Subject must be at most ${adminLimits.subject.max} characters.`;
  if (hasControlCharacters(value)) return "Subject must be a single line.";
  const problem = findTemplateProblem(value);
  return problem ? describePlaceholderProblem(problem) : undefined;
}

function validateBody(value: string) {
  if (value.length === 0) return "Message is required.";
  if (value.length > adminLimits.body.max)
    return `Message must be at most ${adminLimits.body.max} characters.`;
  if (/[\u0000-\u0008\u000b-\u001f\u007f]/.test(value))
    return "Message contains characters that cannot be sent.";
  const problem = findTemplateProblem(value);
  return problem ? describePlaceholderProblem(problem) : undefined;
}

/** A subject keeps its spacing; only surrounding whitespace is removed. */
function readSubject(input: FormData) {
  return readField(input, "subject").trim();
}

export type TemplateInput = { name: string; subject: string; body: string };

type TemplateField = "name" | "subject" | "body";

export function validateTemplate(input: FormData) {
  const name = normalizeLine(readField(input, "name"));
  const subject = readSubject(input);
  const body = normalizeText(readField(input, "body"));
  return finish<TemplateField, TemplateInput>(
    { name, subject, body },
    {
      name: validateName(name),
      subject: validateSubject(subject),
      body: validateBody(body),
    },
  );
}

/** Server-generated: a 13-digit millisecond timestamp and 128 random bits. */
const operationIdPattern = /^\d{13}\.[A-Za-z0-9_-]{22}$/;

export function isWellFormedOperationId(value: string) {
  return operationIdPattern.test(value);
}

export type SendInput = {
  operationId: string;
  senderIdentityId: string;
  contactIds: string[];
  emails: string[];
  templateId: string | null;
  subject: string;
  body: string;
};

type SendField = "senderIdentityId" | "recipients" | "subject" | "body";

/**
 * Shape and size only. Ownership of the sender, contacts, and template, and
 * every limit, are decided on the server from the session, never from here.
 */
export function validateSend(input: FormData) {
  const operationId = readField(input, "operationId");
  const senderIdentityId = readField(input, "senderIdentityId");
  const contactIds = [
    ...new Set(
      input
        .getAll("contactId")
        .filter((value): value is string => typeof value === "string")
        .filter(Boolean),
    ),
  ];
  const emails = readField(input, "emails")
    .split(/[\s,;]+/)
    .map(normalizeEmail)
    .filter(Boolean);
  const templateId = readField(input, "templateId") || null;
  const subject = readSubject(input);
  const body = normalizeText(readField(input, "body"));

  const invalidEmail = emails.find((email) => !isHeaderSafeEmail(email));
  const inputs = contactIds.length + emails.length;
  const errors: FieldErrors<SendField> = {
    senderIdentityId: senderIdentityId
      ? undefined
      : "Choose an address to send from.",
    recipients:
      inputs === 0
        ? "Choose at least one recipient."
        : inputs > adminLimits.recipientInputs.max
          ? `At most ${adminLimits.recipientInputs.max} recipients can be entered at once.`
          : invalidEmail
            ? `${invalidEmail.slice(0, 60)} is not a valid email address.`
            : undefined,
    subject: validateSubject(subject),
    body: validateBody(body),
  };
  if (!isWellFormedOperationId(operationId)) {
    return {
      success: false as const,
      errors: {
        ...errors,
        recipients: "This form is out of date. Reload the page and try again.",
      },
    };
  }
  return finish<SendField, SendInput>(
    {
      operationId,
      senderIdentityId,
      contactIds,
      emails,
      templateId,
      subject,
      body,
    },
    errors,
  );
}

export const settingBounds = {
  dailyTotalEmails: { min: 0, max: 500 },
  dailyBulkRecipients: { min: 0, max: 500 },
  /** Bounded by what one request can send within the function's timeout. */
  maxBulkRecipientsPerOperation: { min: 1, max: 20 },
} as const;

export type SettingsInput = {
  sendingEnabled: boolean;
  bulkSendingEnabled: boolean;
  templatesEnabled: boolean;
  contactsEnabled: boolean;
  dailyTotalEmails: number;
  dailyBulkRecipients: number;
  maxBulkRecipientsPerOperation: number;
};

type LimitField = keyof typeof settingBounds;

export function validateSettings(input: FormData) {
  const errors: FieldErrors<LimitField> = {};
  const limits = {} as Record<LimitField, number>;
  for (const field of Object.keys(settingBounds) as LimitField[]) {
    const { min, max } = settingBounds[field];
    const raw = readField(input, field).trim();
    const value = /^\d{1,4}$/.test(raw) ? Number(raw) : Number.NaN;
    if (!Number.isInteger(value) || value < min || value > max) {
      errors[field] = `Enter a whole number from ${min} to ${max}.`;
    }
    limits[field] = value;
  }
  const flag = (name: string) => readField(input, name) === "on";
  return finish<LimitField, SettingsInput>(
    {
      sendingEnabled: flag("sendingEnabled"),
      bulkSendingEnabled: flag("bulkSendingEnabled"),
      templatesEnabled: flag("templatesEnabled"),
      contactsEnabled: flag("contactsEnabled"),
      ...limits,
    },
    errors,
  );
}

export function validateRejectionReason(value: string) {
  const reason = normalizeLine(value);
  return reason.length > adminLimits.rejectionReason.max
    ? {
        success: false as const,
        error: `Reason must be at most ${adminLimits.rejectionReason.max} characters.`,
      }
    : { success: true as const, reason: reason || null };
}
