import { Link } from "@/components/ui/Link";
import { siteConfig } from "@/lib/site/config";

/** Direct contact beside the form: every method in `siteConfig.contact`. */
export function ContactDetails() {
  if (siteConfig.contact.length === 0) return null;

  return (
    <section aria-labelledby="contact-details-heading">
      <h2
        id="contact-details-heading"
        className="font-mono text-meta font-medium text-muted-foreground uppercase"
      >
        Direct
      </h2>
      <ul className="mt-3">
        {siteConfig.contact.map((method) => (
          <li key={method.label}>
            <Link
              href={method.href}
              variant="subtle"
              className="inline-flex min-h-11 items-center text-body-sm"
            >
              {method.value}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
