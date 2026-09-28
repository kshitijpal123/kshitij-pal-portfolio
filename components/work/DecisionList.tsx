import { Stagger } from "@/components/motion/Stagger";
import { StaggerItem } from "@/components/motion/StaggerItem";

type Decision = {
  decision: string;
  why: string;
};

type DecisionListProps = {
  decisions: readonly Decision[];
};

/** Numbered decisions, each an h3 followed by its rationale. */
export function DecisionList({ decisions }: DecisionListProps) {
  return (
    <Stagger as="ol" className="divide-y divide-border border-y border-border">
      {decisions.map((item, index) => (
        <StaggerItem
          key={item.decision}
          as="li"
          className="flex gap-4 py-6 sm:gap-6"
        >
          <span
            aria-hidden="true"
            className="pt-1 font-mono text-meta text-muted-foreground"
          >
            {String(index + 1).padStart(2, "0")}
          </span>
          <div className="min-w-0">
            <h3 className="text-body-lg">{item.decision}</h3>
            <p className="mt-3 max-w-measure text-muted-foreground">
              <span className="mr-2 font-mono text-meta text-accent uppercase">
                Why
              </span>
              {item.why}
            </p>
          </div>
        </StaggerItem>
      ))}
    </Stagger>
  );
}
