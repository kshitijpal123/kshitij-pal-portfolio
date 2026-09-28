import { Stagger } from "@/components/motion/Stagger";
import { StaggerItem } from "@/components/motion/StaggerItem";
import { Surface } from "@/components/ui/Surface";

type Table = {
  name: string;
  description: string;
};

type TableGroup = {
  name: string;
  tables: readonly Table[];
};

type DataModelOverviewProps = {
  groups: readonly TableGroup[];
};

/** Tables grouped by responsibility. Each group is an h3 over a term list. */
export function DataModelOverview({ groups }: DataModelOverviewProps) {
  return (
    <Stagger as="ul" className="grid gap-4 sm:grid-cols-2">
      {groups.map((group) => (
        <StaggerItem key={group.name} as="li">
          <Surface className="h-full">
            <h3 className="font-mono text-meta font-medium text-muted-foreground uppercase">
              {group.name}
            </h3>
            <dl className="mt-4 space-y-3">
              {group.tables.map((table) => (
                <div key={table.name}>
                  <dt>
                    <code className="font-mono text-body-sm font-medium">
                      {table.name}
                    </code>
                  </dt>
                  <dd className="mt-0.5 text-body-sm text-muted-foreground">
                    {table.description}
                  </dd>
                </div>
              ))}
            </dl>
          </Surface>
        </StaggerItem>
      ))}
    </Stagger>
  );
}
