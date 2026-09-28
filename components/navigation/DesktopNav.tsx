import { NavLink } from "@/components/navigation/NavLink";
import { siteConfig } from "@/lib/site/config";

export function DesktopNav() {
  return (
    <nav aria-label="Primary">
      <ul className="flex items-center gap-6">
        {siteConfig.nav.map((item) => (
          <li key={item.href}>
            <NavLink
              href={item.href}
              className="text-body-sm font-medium underline-offset-8 data-active:underline data-active:decoration-accent data-active:decoration-2"
            >
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
