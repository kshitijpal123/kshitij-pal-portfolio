import { Link } from "@/components/ui/Link";
import { siteConfig } from "@/lib/site/config";

/**
 * Direct links beside the contact form: every configured social profile and,
 * once `siteConfig.resumeHref` is set, the résumé. Unset links are omitted.
 */
export function ContactLinks() {
  const { resumeHref } = siteConfig;
  const social = siteConfig.social.flatMap((link) =>
    link.href ? [{ label: link.label, href: link.href }] : [],
  );

  if (social.length === 0 && !resumeHref) return null;

  return (
    <section aria-labelledby="contact-links-heading">
      <h2
        id="contact-links-heading"
        className="font-mono text-meta font-medium text-muted-foreground uppercase"
      >
        Elsewhere
      </h2>
      <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-1">
        {social.map((link) => (
          <li key={link.label}>
            <Link
              href={link.href}
              variant="subtle"
              rel="me"
              className="inline-flex min-h-11 items-center text-body-sm"
            >
              {link.label}
            </Link>
          </li>
        ))}
        {resumeHref && (
          <li>
            <Link
              href={resumeHref}
              variant="subtle"
              className="inline-flex min-h-11 items-center text-body-sm"
            >
              Resume <span className="ml-1 font-mono text-meta">(PDF)</span>
            </Link>
          </li>
        )}
      </ul>
    </section>
  );
}
