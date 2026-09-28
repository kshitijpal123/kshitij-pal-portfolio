import type { ChangeEvent } from "react";
import type { ContactField as Field } from "@/lib/contact/validation";
import { cx } from "@/lib/utils/cx";

type ContactFieldProps = {
  name: Field;
  label: string;
  value: string;
  error?: string;
  maxLength: number;
  type?: "text" | "email" | "textarea";
  autoComplete?: string;
  onChange: (name: Field, value: string) => void;
  onBlur: (name: Field) => void;
};

const controlClassName =
  "block w-full rounded-control border border-border-strong bg-surface px-3 text-body text-foreground transition-colors hover:border-foreground aria-invalid:border-danger";

/**
 * One labelled form control with its error message. The error is linked with
 * `aria-describedby` and rendered only while the field is invalid.
 */
export function ContactField({
  name,
  label,
  value,
  error,
  maxLength,
  type = "text",
  autoComplete,
  onChange,
  onBlur,
}: ContactFieldProps) {
  const id = `contact-${name}`;
  const errorId = `${id}-error`;

  const shared = {
    id,
    name,
    value,
    maxLength,
    required: true,
    autoComplete,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? errorId : undefined,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange(name, event.target.value),
    onBlur: () => onBlur(name),
  };

  return (
    <div>
      <label htmlFor={id} className="block text-body-sm font-medium">
        {label}
      </label>
      {type === "textarea" ? (
        <textarea
          {...shared}
          rows={8}
          className={cx(controlClassName, "mt-2 min-h-40 resize-y py-2.5")}
        />
      ) : (
        <input
          {...shared}
          type={type}
          className={cx(controlClassName, "mt-2 min-h-11 py-2")}
        />
      )}
      {error && (
        <p id={errorId} className="mt-2 text-body-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
