import type { ComponentProps } from "react";
import { cx } from "@/lib/utils/cx";

export type SectionSpacing = "default" | "editorial";

const spacings: Record<SectionSpacing, string> = {
  default: "py-section",
  editorial: "py-editorial",
};

type SectionProps = ComponentProps<"section"> & {
  spacing?: SectionSpacing;
  muted?: boolean;
};

/** Vertical page rhythm. Width and headings are composed inside it. */
export function Section({
  spacing = "default",
  muted = false,
  className,
  ...props
}: SectionProps) {
  return (
    <section
      className={cx(spacings[spacing], muted && "bg-surface-muted", className)}
      {...props}
    />
  );
}
