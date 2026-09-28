import type { ContactSubmission } from "@/lib/contact/validation";

export type ContactEmail = {
  subject: string;
  text: string;
  html: string;
};

const htmlEntities: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => htmlEntities[character]);
}

/**
 * Renders a validated submission. Every submitted value is escaped in the
 * HTML part; the subject is built from a fixed prefix and the single-line
 * subject, which the validator has already stripped of line breaks.
 */
export function buildContactEmail(submission: ContactSubmission): ContactEmail {
  const { name, email, subject, message } = submission;

  const text = [
    `Name: ${name}`,
    `Email: ${email}`,
    `Subject: ${subject}`,
    "",
    "Message:",
    message,
    "",
    "Reply to this email to respond to the sender.",
  ].join("\n");

  const rows = [
    ["Name", name],
    ["Email", email],
    ["Subject", subject],
  ]
    .map(
      ([label, value]) =>
        `<tr><th align="left" style="padding:4px 16px 4px 0;vertical-align:top">${label}</th><td style="padding:4px 0">${escapeHtml(value)}</td></tr>`,
    )
    .join("");

  const html = [
    '<div style="font-family:sans-serif;font-size:14px;line-height:1.5">',
    `<table role="presentation" cellpadding="0" cellspacing="0">${rows}</table>`,
    '<p style="margin:16px 0 4px"><strong>Message</strong></p>',
    `<p style="margin:0;white-space:pre-wrap">${escapeHtml(message)}</p>`,
    '<p style="margin:16px 0 0;color:#555">Reply to this email to respond to the sender.</p>',
    "</div>",
  ].join("");

  return { subject: `[Portfolio Contact] ${subject}`, text, html };
}
