import NextLink from "next/link";
import type { ComponentProps } from "react";
import { cx } from "@/lib/utils/cx";

export type LinkVariant = "inline" | "nav" | "subtle";

const variants: Record<LinkVariant, string> = {
  inline:
    "text-accent underline underline-offset-2 hover:text-accent-hover hover:decoration-2",
  nav: "inline-flex min-h-11 items-center text-muted-foreground hover:text-foreground aria-[current=page]:text-foreground",
  subtle:
    "text-muted-foreground underline decoration-border-strong underline-offset-4 hover:text-foreground hover:decoration-foreground",
};

type LinkProps = ComponentProps<typeof NextLink> & {
  variant?: LinkVariant;
};

/**
 * A styled `next/link`. It renders a plain `<a>`, so it works for internal
 * routes, external URLs, and `mailto:`; client-side navigation applies only
 * to internal routes. Mark the active navigation item with
 * `aria-current="page"`.
 */
export function Link({ variant = "inline", className, ...props }: LinkProps) {
  return (
    <NextLink
      className={cx(
        "transition-colors duration-150",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
