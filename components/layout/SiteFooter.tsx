import { ResumeLink } from "@/components/navigation/ResumeLink";
import { Container } from "@/components/ui/Container";
import { Link } from "@/components/ui/Link";
import { siteConfig } from "@/lib/site/config";

export function SiteFooter() {
  const social = siteConfig.social.flatMap((link) =>
    link.href ? [{ label: link.label, href: link.href }] : [],
  );
  const hasProfileLinks = social.length > 0 || siteConfig.resumeHref !== null;

  return (
    <footer className="border-t border-border text-body-sm">
      <Container>
        <div className="flex flex-col gap-8 py-12 md:flex-row md:justify-between">
          <div>
            <p className="font-semibold">{siteConfig.name}</p>
            <p className="mt-1 font-mono text-meta text-muted-foreground uppercase">
              {siteConfig.role}
            </p>
          </div>

          <div className="flex flex-wrap gap-x-16 gap-y-8">
            <nav aria-label="Footer">
              <ul className="grid grid-cols-2 gap-x-8 sm:grid-cols-3">
                {siteConfig.nav.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href} variant="nav">
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>

            {hasProfileLinks && (
              <nav aria-label="Profiles">
                <ul>
                  {social.map((link) => (
                    <li key={link.label}>
                      <Link href={link.href} variant="nav" rel="me">
                        {link.label}
                      </Link>
                    </li>
                  ))}
                  {siteConfig.resumeHref && (
                    <li>
                      <ResumeLink />
                    </li>
                  )}
                </ul>
              </nav>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-border py-6 text-caption text-muted-foreground sm:flex-row sm:justify-between">
          <p>
            © {new Date().getFullYear()} {siteConfig.name}
          </p>
          <p className="font-mono text-meta">
            Built with Next.js and TypeScript
          </p>
        </div>
      </Container>
    </footer>
  );
}
