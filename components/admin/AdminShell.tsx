import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { Link } from "@/components/ui/Link";
import { Section } from "@/components/ui/Section";
import { logoutAction } from "@/lib/admin/actions";
import type { PublicUser } from "@/lib/admin/model";

export type AdminPage =
  | "dashboard"
  | "compose"
  | "schedules"
  | "contacts"
  | "templates"
  | "senders"
  | "users"
  | "approvals";

const navigation: {
  page: AdminPage;
  label: string;
  href: string;
  ownerOnly?: boolean;
}[] = [
  { page: "dashboard", label: "Dashboard", href: "/admin" },
  { page: "compose", label: "Compose", href: "/admin/compose" },
  { page: "schedules", label: "Schedules", href: "/admin/schedules" },
  { page: "contacts", label: "Contacts", href: "/admin/contacts" },
  { page: "templates", label: "Templates", href: "/admin/templates" },
  { page: "senders", label: "Sender identities", href: "/admin/senders" },
  { page: "users", label: "Users", href: "/admin/users", ownerOnly: true },
  {
    page: "approvals",
    label: "Approvals",
    href: "/admin/approvals",
    ownerOnly: true,
  },
];

type AdminShellProps = {
  user: PublicUser;
  current: AdminPage;
  children: ReactNode;
};

/**
 * The signed-in console frame: navigation, the signed-in account, and sign
 * out. OWNER-only links are hidden from USERs for clarity; the pages and
 * actions enforce access themselves.
 */
export function AdminShell({ user, current, children }: AdminShellProps) {
  const items = navigation.filter(
    (item) => !item.ownerOnly || user.role === "OWNER",
  );

  return (
    <Section>
      <Container className="grid gap-10 lg:grid-cols-4 lg:gap-12">
        <div className="lg:border-r lg:border-border lg:pr-8">
          <p className="font-mono text-meta text-muted-foreground uppercase">
            Private console
          </p>
          <nav aria-label="Console" className="mt-4">
            <ul className="flex flex-wrap gap-x-6 lg:flex-col">
              {items.map((item) => (
                <li key={item.page}>
                  <Link
                    variant="nav"
                    href={item.href}
                    aria-current={item.page === current ? "page" : undefined}
                    className="decoration-accent decoration-2 underline-offset-8 aria-[current=page]:font-medium aria-[current=page]:underline"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="mt-6 border-t border-border pt-6 text-body-sm">
            <p className="text-muted-foreground">Signed in as</p>
            <p className="font-medium break-words">{user.email}</p>
            <form action={logoutAction} className="mt-4">
              <Button type="submit" variant="secondary">
                Sign out
              </Button>
            </form>
          </div>
        </div>
        <div className="min-w-0 lg:col-span-3">{children}</div>
      </Container>
    </Section>
  );
}
