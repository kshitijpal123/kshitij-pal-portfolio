import { Badge, type BadgeVariant } from "@/components/ui/Badge";

const variants: Record<string, BadgeVariant> = {
  ACTIVE: "accent",
  APPROVED: "accent",
  ACCEPTED: "accent",
  PENDING: "default",
  REQUESTED: "default",
  OWNER: "default",
  USER: "default",
  DISABLED: "muted",
  REJECTED: "muted",
  EXPIRED: "muted",
  REVOKED: "muted",
};

/** A role or status as text; the variant only reinforces it. */
export function StatusBadge({ value }: { value: string }) {
  return <Badge variant={variants[value] ?? "default"}>{value}</Badge>;
}
