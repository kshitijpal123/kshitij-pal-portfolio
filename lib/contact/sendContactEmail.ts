import { Resend } from "resend";
import { buildContactEmail } from "@/lib/contact/email";
import type { ContactSubmission } from "@/lib/contact/validation";

export type ContactConfig = {
  apiKey: string;
  to: string;
  from: string;
};

/**
 * Reads the server-only delivery settings. `null` when any is missing. None
 * has a `NEXT_PUBLIC_` prefix, so Next.js never inlines them into client code.
 */
export function getContactConfig(
  env: Record<string, string | undefined> = process.env,
): ContactConfig | null {
  const apiKey = env.RESEND_API_KEY?.trim();
  const to = env.CONTACT_TO_EMAIL?.trim();
  const from = env.CONTACT_FROM_EMAIL?.trim();
  return apiKey && to && from ? { apiKey, to, from } : null;
}

export type SendResult = { sent: true } | { sent: false; reason: string };

/**
 * Sends a validated submission to the configured inbox. The sender is always
 * the verified `from` address; the visitor is only the reply-to.
 */
export async function sendContactEmail(
  config: ContactConfig,
  submission: ContactSubmission,
): Promise<SendResult> {
  const { subject, text, html } = buildContactEmail(submission);
  const resend = new Resend(config.apiKey);

  const { error } = await resend.emails.send({
    from: config.from,
    to: config.to,
    replyTo: submission.email,
    subject,
    text,
    html,
  });

  return error ? { sent: false, reason: error.name } : { sent: true };
}
