import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/admin/LoginForm";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { getCurrentUser } from "@/lib/admin/session";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/admin");

  return (
    <Section aria-labelledby="login-heading">
      <Container size="measure">
        <p className="font-mono text-meta text-muted-foreground uppercase">
          Private console
        </p>
        <h1 id="login-heading" className="mt-4 text-h2">
          Sign in
        </h1>
        <p className="mt-3 text-body text-muted-foreground">
          Access is by invitation only.
        </p>
        <div className="mt-8">
          <LoginForm />
        </div>
      </Container>
    </Section>
  );
}
