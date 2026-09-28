import { Stagger } from "@/components/motion/Stagger";
import { StaggerItem } from "@/components/motion/StaggerItem";
import { Surface } from "@/components/ui/Surface";

type StatusGroup = {
  label: string;
  items: readonly string[];
};

type StatusSummaryProps = {
  groups: readonly StatusGroup[];
};

/** Project state in ordered groups, such as established, direction, next. */
export function StatusSummary({ groups }: StatusSummaryProps) {
  return (
    <Stagger as="ul" className="grid gap-4 md:grid-cols-3">
      {groups.map((group) => (
        <StaggerItem key={group.label} as="li">
          <Surface className="h-full">
            <h3 className="font-mono text-meta font-medium text-muted-foreground uppercase">
              {group.label}
            </h3>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-body-sm marker:text-border-strong">
              {group.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </Surface>
        </StaggerItem>
      ))}
    </Stagger>
  );
}
