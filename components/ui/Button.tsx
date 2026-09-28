import type { ComponentProps } from "react";
import { cx } from "@/lib/utils/cx";

export type ButtonVariant = "primary" | "secondary" | "ghost";

const base =
  "inline-flex min-h-11 items-center justify-center gap-inline rounded-control border px-4 text-body-sm font-medium transition-colors duration-150 active:translate-y-px disabled:pointer-events-none disabled:opacity-50";

const variants: Record<ButtonVariant, string> = {
  primary:
    "border-transparent bg-accent text-accent-foreground shadow-subtle hover:bg-accent-hover active:shadow-none",
  secondary: "border-border-strong bg-surface text-foreground hover:bg-muted",
  ghost:
    "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
};

/**
 * Button styles for elements that must stay links, such as a call to action
 * that navigates. Pass the result as the `className` of a link.
 */
export function buttonClassName(variant: ButtonVariant = "primary") {
  return cx(base, variants[variant]);
}

type ButtonProps = ComponentProps<"button"> & {
  variant?: ButtonVariant;
};

export function Button({
  variant = "primary",
  type = "button",
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(buttonClassName(variant), className)}
      {...props}
    />
  );
}
