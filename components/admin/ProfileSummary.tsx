import { StatusBadge } from "@/components/admin/StatusBadge";
import { Surface } from "@/components/ui/Surface";
import type { PublicUser } from "@/lib/admin/model";

export function ProfileSummary({ user }: { user: PublicUser }) {
  return (
    <Surface>
      <h2 className="text-h3">Your account</h2>
      <dl className="mt-4 grid gap-4 text-body-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Name</dt>
          <dd className="mt-1 font-medium break-words">{user.name}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Email</dt>
          <dd className="mt-1 font-medium break-words">{user.email}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Role</dt>
          <dd className="mt-1">
            <StatusBadge value={user.role} />
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Status</dt>
          <dd className="mt-1">
            <StatusBadge value={user.status} />
          </dd>
        </div>
      </dl>
    </Surface>
  );
}
