import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { SetupForm } from "@/components/admin/SetupForm";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { getBootstrapToken, isBootstrapAvailable } from "@/lib/admin/auth";
import { getAdminStore } from "@/lib/admin/getAdminStore";
import { getCurrentUser } from "@/lib/admin/session";

export const metadata: Metadata = { title: "Owner setup" };

/** Exists only while a setup token is configured and no OWNER exists. */
export default async function SetupPage() {
  if (await getCurrentUser()) redirect("/admin");
  if (!(await isBootstrapAvailable(getAdminStore(), getBootstrapToken()))) {
    notFound();
  }

  return (
    <Section aria-labelledby="setup-heading">
      <Container size="measure">
        <p className="font-mono text-meta text-muted-foreground uppercase">
          Private console
        </p>
        <h1 id="setup-heading" className="mt-4 text-h2">
          Create the owner account
        </h1>
        <p className="mt-3 text-body text-muted-foreground">
          One-time setup. Once the owner exists, this page no longer does.
        </p>
        <div className="mt-8">
          <SetupForm />
        </div>
      </Container>
    </Section>
  );
}
