import type { ComponentProps } from "react";
import { cx } from "@/lib/utils/cx";

type DividerProps = Omit<ComponentProps<"hr">, "children"> & {
  decorative?: boolean;
};

/**
 * A horizontal rule. It is a separator for assistive technology unless
 * `decorative`, which hides it where it only separates visually.
 */
export function Divider({
  decorative = false,
  className,
  ...props
}: DividerProps) {
  return (
    <hr
      role={decorative ? "presentation" : undefined}
      className={cx("border-border", className)}
      {...props}
    />
  );
}
