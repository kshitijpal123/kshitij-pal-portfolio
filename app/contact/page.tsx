import type { Metadata } from "next";
import { ContactForm } from "@/components/contact/ContactForm";
import { ContactLinks } from "@/components/contact/ContactLinks";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = pageMetadata({
  title: "Contact",
  description:
    "Get in touch with Kshitij Pal for backend engineering opportunities, technical conversations, and thoughtful collaboration.",
  path: "/contact",
});

export default function ContactPage() {
  return (
    <Section spacing="editorial" aria-labelledby="contact-heading">
      <Container className="grid gap-12 lg:grid-cols-3 lg:grid-rows-[auto_1fr] lg:gap-x-12 lg:gap-y-10">
        <div>
          <p className="flex items-center gap-3 font-mono text-meta text-muted-foreground uppercase">
            <span aria-hidden="true" className="h-px w-6 bg-border-strong" />
            Contact
          </p>
          <h1
            id="contact-heading"
            className="mt-6 font-serif text-h1 font-semibold sm:text-display"
          >
            Let&apos;s connect.
          </h1>
          <p className="mt-6 max-w-measure text-body-lg text-muted-foreground">
            I&apos;m open to backend engineering opportunities, technical
            conversations, and thoughtful collaboration.
          </p>
        </div>

        <div className="border-t border-border pt-10 lg:col-span-2 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-12">
          <ContactForm />
        </div>

        <div className="lg:col-start-1 lg:row-start-2">
          <ContactLinks />
        </div>
      </Container>
    </Section>
  );
}
