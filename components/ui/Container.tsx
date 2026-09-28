import type { ComponentProps } from "react";
import { cx } from "@/lib/utils/cx";

export type ContainerSize = "content" | "wide" | "measure";

const sizes: Record<ContainerSize, string> = {
  content: "max-w-content",
  wide: "max-w-wide",
  measure: "max-w-measure",
};

type ContainerProps = ComponentProps<"div"> & {
  size?: ContainerSize;
};

/**
 * Centers content at a token width with the page gutter. `box-content` makes
 * the width apply to the content, so `measure` keeps its line length on
 * small screens too.
 */
export function Container({
  size = "content",
  className,
  ...props
}: ContainerProps) {
  return (
    <div
      className={cx("mx-auto box-content px-gutter", sizes[size], className)}
      {...props}
    />
  );
}
