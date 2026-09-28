"use client";

import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type MouseEvent } from "react";
import { NavLink } from "@/components/navigation/NavLink";
import { ResumeLink } from "@/components/navigation/ResumeLink";
import { ThemeSwitcher } from "@/components/navigation/ThemeSwitcher";
import { Button } from "@/components/ui/Button";
import { siteConfig } from "@/lib/site/config";

/**
 * The navigation below `lg`: a disclosure button and a panel that opens in
 * the document flow under the header bar, so no page content sits behind it.
 * The panel closes on Escape, on following a link, and on route change.
 */
export function MobileNav() {
  const pathname = usePathname();
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  // Storing the pathname it was opened on closes the menu on navigation.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpenOn(null);
      buttonRef.current?.focus();
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  function closeOnLinkClick(event: MouseEvent<HTMLDivElement>) {
    if (event.target instanceof Element && event.target.closest("a")) {
      setOpenOn(null);
    }
  }

  return (
    <>
      <Button
        ref={buttonRef}
        variant="ghost"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpenOn(open ? null : pathname)}
        className="aria-expanded:bg-muted aria-expanded:text-foreground lg:hidden"
      >
        Menu
      </Button>

      <div
        id={panelId}
        hidden={!open}
        onClick={closeOnLinkClick}
        className="mt-2.5 basis-full border-t border-border pt-4 pb-2 lg:hidden"
      >
        <nav aria-label="Primary">
          <ul>
            {siteConfig.nav.map((item) => (
              <li key={item.href}>
                <NavLink
                  href={item.href}
                  className="w-full border-l-2 border-transparent pl-3 data-active:border-accent data-active:font-medium"
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-4">
          <ResumeLink />
          <ThemeSwitcher />
        </div>
      </div>
    </>
  );
}
