import { StatusBadge } from "@/components/admin/StatusBadge";
import { Button } from "@/components/ui/Button";
import { setUserStatusAction } from "@/lib/admin/actions";
import { formatTimestamp } from "@/lib/admin/format";
import type { PublicUser } from "@/lib/admin/model";

/** Every account with its status; USER accounts can be disabled or re-enabled. */
export function UserList({ users }: { users: PublicUser[] }) {
  return (
    <ul className="divide-y divide-border border-y border-border">
      {users.map((user) => (
        <li
          key={user.id}
          className="grid gap-3 py-4 sm:grid-cols-3 sm:items-center"
        >
          <div className="min-w-0 sm:col-span-2">
            <p className="font-medium break-words">{user.name}</p>
            <p className="text-body-sm break-words text-muted-foreground">
              {user.email}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusBadge value={user.role} />
              <StatusBadge value={user.status} />
            </div>
            <p className="mt-2 text-caption text-muted-foreground">
              {user.lastLoginAt
                ? `Last signed in ${formatTimestamp(user.lastLoginAt)}`
                : "Never signed in"}
            </p>
          </div>
          {user.role === "USER" && (
            <form action={setUserStatusAction} className="sm:justify-self-end">
              <input type="hidden" name="userId" value={user.id} />
              <input
                type="hidden"
                name="status"
                value={user.status === "ACTIVE" ? "DISABLED" : "ACTIVE"}
              />
              <Button type="submit" variant="secondary">
                {user.status === "ACTIVE" ? "Disable" : "Re-enable"}{" "}
                <span className="sr-only">{user.name}</span>
              </Button>
            </form>
          )}
        </li>
      ))}
    </ul>
  );
}
