import { Badge } from "@/components/ui/Badge";

type Tenant = {
  name: string;
  roles: readonly string[];
};

type TenancyDiagramProps = {
  caption: string;
  platform: string;
  platformRole: string;
  tenants: readonly Tenant[];
};

/**
 * A platform containing isolated tenants, drawn as nested boxes over a
 * nested list, so the hierarchy is the same with or without the drawing.
 */
export function TenancyDiagram({
  caption,
  platform,
  platformRole,
  tenants,
}: TenancyDiagramProps) {
  return (
    <figure>
      <figcaption className="font-mono text-meta text-muted-foreground uppercase">
        {caption}
      </figcaption>
      <ul className="mt-5">
        <li className="rounded-container border border-border-strong bg-surface-muted p-card">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="font-medium">{platform}</span>
            <Badge variant="accent">{platformRole}</Badge>
          </p>
          <ul className="mt-4 grid gap-3 sm:grid-cols-3">
            {tenants.map((tenant) => (
              <li
                key={tenant.name}
                className="rounded-control border border-border-strong bg-surface p-4"
              >
                <p className="text-body-sm font-medium">{tenant.name}</p>
                <ul
                  aria-label={`${tenant.name} roles`}
                  className="mt-3 flex flex-wrap gap-2"
                >
                  {tenant.roles.map((role) => (
                    <li key={role}>
                      <Badge>{role}</Badge>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </li>
      </ul>
    </figure>
  );
}
