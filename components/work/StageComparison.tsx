import { Stagger } from "@/components/motion/Stagger";
import { StaggerItem } from "@/components/motion/StaggerItem";
import { Surface } from "@/components/ui/Surface";

type Stage = {
  label: string;
  /** What the stage is, in a few words. */
  role: string;
  description: string;
};

type StageComparisonProps = {
  caption: string;
  stages: readonly Stage[];
};

/**
 * Stages that must not be confused with one another, separated by "≠".
 * Side by side from `md`, stacked below it.
 */
export function StageComparison({ caption, stages }: StageComparisonProps) {
  return (
    <figure>
      <figcaption className="font-mono text-meta text-muted-foreground uppercase">
        {caption}
      </figcaption>
      <Stagger as="ul" className="mt-5 flex flex-col gap-3 md:flex-row">
        {stages.map((stage, index) => (
          <StaggerItem
            key={stage.label}
            as="li"
            className="flex flex-col gap-3 md:flex-1 md:flex-row"
          >
            {index > 0 && (
              <span
                aria-hidden="true"
                className="self-center font-mono text-h3 text-muted-foreground"
              >
                ≠
              </span>
            )}
            <Surface className="flex-1">
              <p className="font-mono text-body-sm font-medium uppercase">
                {stage.label}
              </p>
              <p className="mt-1 text-body-sm text-accent">{stage.role}</p>
              <p className="mt-3 text-body-sm text-muted-foreground">
                {stage.description}
              </p>
            </Surface>
          </StaggerItem>
        ))}
      </Stagger>
    </figure>
  );
}
