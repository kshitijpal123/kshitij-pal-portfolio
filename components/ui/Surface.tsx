import type { ComponentProps } from "react";
import { cx } from "@/lib/utils/cx";

export type SurfaceVariant = "default" | "muted" | "elevated";

const variants: Record<SurfaceVariant, string> = {
  default: "bg-surface",
  muted: "bg-surface-muted",
  elevated: "bg-surface shadow-elevated",
};

type SurfaceProps = ComponentProps<"div"> & {
  variant?: SurfaceVariant;
  padded?: boolean;
};

/** A bordered panel. Children own their internal layout. */
export function Surface({
  variant = "default",
  padded = true,
  className,
  ...props
}: SurfaceProps) {
  return (
    <div
      className={cx(
        "rounded-container border border-border",
        variants[variant],
        padded && "p-card",
        className,
      )}
      {...props}
    />
  );
}
