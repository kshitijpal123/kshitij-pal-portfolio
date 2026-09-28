import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import ContactPage, { metadata } from "@/app/contact/page";
import { siteConfig } from "@/lib/site/config";

const configuredResumeHref = siteConfig.resumeHref;

afterEach(() => {
  siteConfig.resumeHref = configuredResumeHref;
});

describe("ContactPage", () => {
  it("renders Let's connect as the only top-level heading", () => {
    render(<ContactPage />);

    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("Let's connect.");
    expect(
      screen
        .getAllByRole("heading", { level: 2 })
        .map((heading) => heading.textContent),
    ).toEqual(["Send a message", "Direct", "Elsewhere"]);
  });

  it("links the email address and phone number from the site config", () => {
    render(<ContactPage />);

    const direct = within(screen.getByRole("region", { name: "Direct" }));
    expect(
      direct.getByRole("link", { name: "kshitij180123@gmail.com" }),
    ).toHaveAttribute("href", "mailto:kshitij180123@gmail.com");
    expect(
      direct.getByRole("link", { name: "+91 8791243983" }),
    ).toHaveAttribute("href", "tel:+918791243983");
  });

  it("introduces the page professionally", () => {
    render(<ContactPage />);

    const intro = within(
      screen.getByRole("region", { name: "Let's connect." }),
    );
    expect(intro.getByText("Contact")).toBeInTheDocument();
    expect(
      intro.getByText(
        "I'm open to backend engineering opportunities, technical conversations, and thoughtful collaboration.",
      ),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(
      /project in mind|dream website|something amazing/i,
    );
  });

  it("renders the contact form with all four fields", () => {
    render(<ContactPage />);

    const form = within(screen.getByRole("form", { name: "Send a message" }));
    for (const label of ["Name", "Email", "Subject", "Message"]) {
      expect(form.getByLabelText(label)).toBeInTheDocument();
    }
    expect(
      form.getByRole("button", { name: "Send message" }),
    ).toBeInTheDocument();
  });

  it("links the social profiles from the site config", () => {
    render(<ContactPage />);

    for (const { label, href } of siteConfig.social) {
      if (href) {
        expect(screen.getByRole("link", { name: label })).toHaveAttribute(
          "href",
          href,
        );
      }
    }
  });

  it("has no résumé link while resumeHref is null", () => {
    siteConfig.resumeHref = null;
    render(<ContactPage />);

    expect(
      screen.queryByRole("link", { name: /resume/i }),
    ).not.toBeInTheDocument();
  });

  it("links the résumé when it is configured", () => {
    siteConfig.resumeHref = "/resume/Kshitij-Pal-Resume.pdf";
    render(<ContactPage />);

    expect(screen.getByRole("link", { name: "Resume (PDF)" })).toHaveAttribute(
      "href",
      "/resume/Kshitij-Pal-Resume.pdf",
    );
  });

  it("defines the page title and description", () => {
    expect(metadata.title).toBe("Contact");
    expect(metadata.description).toBe(
      "Get in touch with Kshitij Pal for backend engineering opportunities, technical conversations, and thoughtful collaboration.",
    );
  });
});
