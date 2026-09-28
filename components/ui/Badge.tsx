import type { ComponentProps } from "react";
import { cx } from "@/lib/utils/cx";

export type BadgeVariant = "default" | "accent" | "muted";

const variants: Record<BadgeVariant, string> = {
  default: "border-border bg-surface text-foreground",
  accent: "border-accent text-accent",
  muted: "border-transparent bg-muted text-muted-foreground",
};

type BadgeProps = ComponentProps<"span"> & {
  variant?: BadgeVariant;
};

/** A compact mono label for technologies, roles, and metadata. */
export function Badge({
  variant = "default",
  className,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-control border px-2 py-0.5 font-mono text-meta font-medium whitespace-nowrap uppercase",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
