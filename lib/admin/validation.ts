export const adminLimits = {
  email: { max: 254 },
  name: { min: 1, max: 100 },
  password: { min: 12, max: 128 },
  rejectionReason: { max: 500 },
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

export function validateRejectionReason(value: string) {
  const reason = normalizeLine(value);
  return reason.length > adminLimits.rejectionReason.max
    ? {
        success: false as const,
        error: `Reason must be at most ${adminLimits.rejectionReason.max} characters.`,
      }
    : { success: true as const, reason: reason || null };
}
