"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Link } from "@/components/ui/Link";
import { isActivePath } from "@/lib/site/isActivePath";
import { cx } from "@/lib/utils/cx";

type NavLinkProps = {
  href: string;
  className?: string;
  children: ReactNode;
};

/**
 * A navigation link that knows whether it is active. The exact route gets
 * `aria-current="page"`; a parent of the current route (Work on
 * `/work/billsync`) gets `aria-current="true"`. Both set `data-active` for
 * styling.
 */
export function NavLink({ href, className, children }: NavLinkProps) {
  const pathname = usePathname();
  const active = isActivePath(pathname, href);

  return (
    <Link
      href={href}
      variant="nav"
      aria-current={active ? (pathname === href ? "page" : "true") : undefined}
      data-active={active || undefined}
      className={cx("data-active:text-foreground", className)}
    >
      {children}
    </Link>
  );
}
