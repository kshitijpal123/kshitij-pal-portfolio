import type { Metadata } from "next";
import { AcceptInvitationForm } from "@/components/admin/AcceptInvitationForm";
import { Container } from "@/components/ui/Container";
import { Link } from "@/components/ui/Link";
import { Section } from "@/components/ui/Section";
import { getOpenInvitationEmail } from "@/lib/admin/session";

/** The URL carries the token, so it is never sent on as a referrer. */
export const metadata: Metadata = {
  title: "Accept invitation",
  referrer: "no-referrer",
};

export default async function InvitationPage({
  params,
}: PageProps<"/admin/invite/[token]">) {
  const { token } = await params;
  const email = await getOpenInvitationEmail(token);

  return (
    <Section aria-labelledby="invitation-heading">
      <Container size="measure">
        <p className="font-mono text-meta text-muted-foreground uppercase">
          Private console
        </p>
        {email ? (
          <>
            <h1 id="invitation-heading" className="mt-4 text-h2">
              Accept your invitation
            </h1>
            <p className="mt-3 text-body text-muted-foreground">
              Create the password for{" "}
              <span className="font-medium break-words text-foreground">
                {email}
              </span>
              . Only you will know it.
            </p>
            <div className="mt-8">
              <AcceptInvitationForm token={token} />
            </div>
          </>
        ) : (
          <>
            <h1 id="invitation-heading" className="mt-4 text-h2">
              Invitation unavailable
            </h1>
            <p className="mt-3 text-body text-muted-foreground">
              This invitation is invalid, has expired, or has already been used.
              Ask the owner for a new one, or{" "}
              <Link href="/admin/login">sign in</Link> if you already have an
              account.
            </p>
          </>
        )}
      </Container>
    </Section>
  );
}
