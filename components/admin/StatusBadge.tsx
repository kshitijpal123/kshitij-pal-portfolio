import { Badge, type BadgeVariant } from "@/components/ui/Badge";

const variants: Record<string, BadgeVariant> = {
  ACTIVE: "accent",
  APPROVED: "accent",
  ACCEPTED: "accent",
  CONNECTED: "accent",
  SENT: "accent",
  ALREADY_SENT: "accent",
  RESERVED: "default",
  IN_PROGRESS: "default",
  UNCERTAIN: "default",
  FAILED: "muted",
  PENDING: "default",
  REQUESTED: "default",
  REAUTH_REQUIRED: "default",
  OWNER: "default",
  USER: "default",
  DISABLED: "muted",
  REJECTED: "muted",
  EXPIRED: "muted",
  REVOKED: "muted",
  DISCONNECTED: "muted",
  NOT_CONNECTED: "muted",
  COMPLETED: "muted",
  CANCELLED: "muted",
  OVERDUE: "default",
  ONE_TIME: "default",
  RECURRING: "default",
  SCHEDULED: "default",
};

/** A role or status as text; the variant only reinforces it. */
export function StatusBadge({ value }: { value: string }) {
  return (
    <Badge variant={variants[value] ?? "default"}>
      {value.replaceAll("_", " ")}
    </Badge>
  );
}
