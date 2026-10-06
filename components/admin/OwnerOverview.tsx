import { Link } from "@/components/ui/Link";
import { Surface } from "@/components/ui/Surface";
import type { Capacity } from "@/lib/admin/invitations";

type OwnerOverviewProps = {
  capacity: Capacity;
  pendingSenderRequests: number;
};

export function OwnerOverview({
  capacity,
  pendingSenderRequests,
}: OwnerOverviewProps) {
  const stats = [
    {
      label: "Users",
      value: `${capacity.users} / ${capacity.max}`,
      href: "/admin/users",
      action: "Manage users",
    },
    {
      label: "Pending invitations",
      value: String(capacity.pendingInvitations),
      href: "/admin/users",
      action: "View invitations",
    },
    {
      label: "Sender requests awaiting review",
      value: String(pendingSenderRequests),
      href: "/admin/approvals",
      action: "Review requests",
    },
  ];

  return (
    <section aria-labelledby="overview-heading">
      <h2 id="overview-heading" className="text-h3">
        Administration
      </h2>
      <ul className="mt-4 grid gap-4 md:grid-cols-3">
        {stats.map((stat) => (
          <li key={stat.label}>
            <Surface className="h-full">
              <p className="text-body-sm text-muted-foreground">{stat.label}</p>
              <p className="mt-2 font-mono text-h2">{stat.value}</p>
              <Link href={stat.href} className="mt-3 inline-block text-body-sm">
                {stat.action}
              </Link>
            </Surface>
          </li>
        ))}
      </ul>
      {capacity.used >= capacity.max && (
        <p className="mt-4 max-w-measure border-l-2 border-border-strong pl-3 text-body-sm">
          All {capacity.max} seats are in use, counting pending invitations.
        </p>
      )}
    </section>
  );
}
