import { cx } from "@/lib/utils/cx";

type AdminFieldProps = {
  name: string;
  label: string;
  type?: "text" | "email" | "password";
  id?: string;
  error?: string;
  hint?: string;
  defaultValue?: string;
  autoComplete?: string;
  maxLength?: number;
  required?: boolean;
};

const controlClassName =
  "mt-2 block min-h-11 w-full rounded-control border border-border-strong bg-surface px-3 py-2 text-body text-foreground transition-colors hover:border-foreground aria-invalid:border-danger";

/**
 * One labelled, uncontrolled input. The hint and the error are linked with
 * `aria-describedby`; the error renders only while the field is invalid.
 */
export function AdminField({
  name,
  label,
  type = "text",
  id = `admin-${name}`,
  error,
  hint,
  defaultValue,
  autoComplete,
  maxLength,
  required = true,
}: AdminFieldProps) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = cx(hint && hintId, error && errorId) || undefined;

  return (
    <div>
      <label htmlFor={id} className="block text-body-sm font-medium">
        {label}
      </label>
      {hint && (
        <p id={hintId} className="mt-1 text-body-sm text-muted-foreground">
          {hint}
        </p>
      )}
      <input
        id={id}
        name={name}
        type={type}
        defaultValue={defaultValue}
        autoComplete={autoComplete}
        maxLength={maxLength}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={controlClassName}
      />
      {error && (
        <p id={errorId} className="mt-2 text-body-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
