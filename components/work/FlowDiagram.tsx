import { Stagger } from "@/components/motion/Stagger";
import { StaggerItem } from "@/components/motion/StaggerItem";
import { cx } from "@/lib/utils/cx";

export type FlowStep = {
  label: string;
  description?: string;
  /** Technical reference for the step, such as a table name. */
  detail?: string;
  /** Marks the step the flow leads to. */
  highlight?: boolean;
};

type FlowDiagramProps = {
  /** Visible caption; it also names the figure for assistive technology. */
  caption: string;
  steps: readonly FlowStep[];
  className?: string;
};

/**
 * An ordered flow drawn as a vertical rail. It is a real `<ol>`, so the
 * sequence reads the same without the rail or the motion.
 */
export function FlowDiagram({ caption, steps, className }: FlowDiagramProps) {
  const detailed = steps.some((step) => step.description);

  return (
    <figure className={cx("max-w-narrow", className)}>
      <figcaption className="font-mono text-meta text-muted-foreground uppercase">
        {caption}
      </figcaption>
      <Stagger as="ol" className="mt-5">
        {steps.map((step, index) => (
          <StaggerItem key={step.label} as="li" className="flex gap-4">
            <div aria-hidden="true" className="flex flex-col items-center">
              <span
                className={cx(
                  "flex size-7 shrink-0 items-center justify-center rounded-control border bg-surface font-mono text-meta",
                  step.highlight
                    ? "border-accent text-accent"
                    : "border-border-strong text-muted-foreground",
                )}
              >
                {index + 1}
              </span>
              {index < steps.length - 1 && (
                <span className="w-px flex-1 bg-border-strong" />
              )}
            </div>
            <div
              className={cx(
                "min-w-0 pt-1",
                index < steps.length - 1 && (detailed ? "pb-7" : "pb-4"),
              )}
            >
              <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span
                  className={cx(
                    "font-mono text-body-sm font-medium uppercase",
                    step.highlight && "text-accent",
                  )}
                >
                  {step.label}
                </span>
                {step.detail && (
                  <code className="font-mono text-caption text-muted-foreground">
                    {step.detail}
                  </code>
                )}
              </p>
              {step.description && (
                <p className="mt-1.5 max-w-measure text-muted-foreground">
                  {step.description}
                </p>
              )}
            </div>
          </StaggerItem>
        ))}
      </Stagger>
    </figure>
  );
}
