import { describe, expect, it } from "vitest";
import { buildContactEmail, escapeHtml } from "@/lib/contact/email";

const submission = {
  name: "Ada <b>Lovelace</b>",
  email: "ada@example.com",
  subject: "Hello & welcome",
  message: 'Line one\n<script>alert("x")</script>',
};

describe("buildContactEmail", () => {
  it("prefixes the subject", () => {
    expect(buildContactEmail(submission).subject).toBe(
      "[Portfolio Contact] Hello & welcome",
    );
  });

  it("includes every field in the plain-text part", () => {
    const { text } = buildContactEmail(submission);

    expect(text).toContain("Name: Ada <b>Lovelace</b>");
    expect(text).toContain("Email: ada@example.com");
    expect(text).toContain("Subject: Hello & welcome");
    expect(text).toContain('Line one\n<script>alert("x")</script>');
  });

  it("escapes submitted content in the HTML part", () => {
    const { html } = buildContactEmail(submission);

    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>");
    expect(html).toContain("Ada &lt;b&gt;Lovelace&lt;/b&gt;");
    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(html).toContain("Hello &amp; welcome");
  });
});

describe("escapeHtml", () => {
  it("encodes the HTML-significant characters", () => {
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
  });
});
