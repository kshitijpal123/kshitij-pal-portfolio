import { cx } from "@/lib/utils/cx";

export type JourneyMarkerVariant = "past" | "current" | "next";

/** A stage marker on the Home journey's vertical rail, used below `lg`. */
export function JourneyMarker({ variant }: { variant: JourneyMarkerVariant }) {
  return (
    <svg
      viewBox="0 0 20 20"
      focusable="false"
      fill="none"
      className="size-5 shrink-0"
    >
      {variant === "current" && (
        <circle cx={10} cy={10} r={9} className="stroke-border-strong" />
      )}
      <circle
        cx={10}
        cy={10}
        r={variant === "current" ? 5.5 : 5}
        strokeWidth={1.5}
        strokeDasharray={variant === "next" ? "2 2" : undefined}
        className={cx(
          "fill-background",
          variant === "current" ? "stroke-accent" : "stroke-border-strong",
        )}
      />
      {variant !== "next" && (
        <circle
          cx={10}
          cy={10}
          r={variant === "current" ? 2.5 : 1.5}
          className={variant === "current" ? "fill-accent" : "fill-foreground"}
        />
      )}
    </svg>
  );
}
