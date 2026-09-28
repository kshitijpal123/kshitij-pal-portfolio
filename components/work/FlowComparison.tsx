import { Surface } from "@/components/ui/Surface";
import { FlowDiagram, type FlowStep } from "@/components/work/FlowDiagram";

type ComparedFlow = {
  caption: string;
  steps: readonly FlowStep[];
  /** What the reader should take from this flow. */
  note: string;
};

type FlowComparisonProps = {
  flows: readonly ComparedFlow[];
};

/** Flows side by side from `md`, stacked below it. */
export function FlowComparison({ flows }: FlowComparisonProps) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {flows.map((flow) => (
        <Surface key={flow.caption}>
          <FlowDiagram caption={flow.caption} steps={flow.steps} />
          <p className="mt-6 border-t border-border pt-4 text-body-sm text-muted-foreground">
            {flow.note}
          </p>
        </Surface>
      ))}
    </div>
  );
}
