import { DesktopNav } from "@/components/navigation/DesktopNav";
import { MobileNav } from "@/components/navigation/MobileNav";
import { ResumeLink } from "@/components/navigation/ResumeLink";
import { ThemeSwitcher } from "@/components/navigation/ThemeSwitcher";
import { Container } from "@/components/ui/Container";
import { Link } from "@/components/ui/Link";
import { siteConfig } from "@/lib/site/config";

export function SiteHeader() {
  return (
    <header className="border-b border-border">
      <Container className="flex flex-wrap items-center justify-between gap-x-6 py-2.5">
        <Link href="/" variant="nav" className="gap-3">
          <span className="font-semibold text-foreground">
            {siteConfig.name}
          </span>
          <span className="hidden font-mono text-meta text-muted-foreground uppercase sm:inline lg:hidden xl:inline">
            {siteConfig.role}
          </span>
        </Link>

        <div className="hidden items-center gap-8 lg:flex">
          <DesktopNav />
          <div className="flex items-center gap-5 border-l border-border pl-6">
            <ResumeLink className="text-body-sm font-medium" />
            <ThemeSwitcher />
          </div>
        </div>

        <MobileNav />
      </Container>
    </header>
  );
}
