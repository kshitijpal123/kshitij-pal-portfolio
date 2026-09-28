import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ContactLinks } from "@/components/contact/ContactLinks";
import { siteConfig } from "@/lib/site/config";

const configuredResumeHref = siteConfig.resumeHref;
const configuredSocial = siteConfig.social;

afterEach(() => {
  siteConfig.resumeHref = configuredResumeHref;
  siteConfig.social = configuredSocial;
});

function links() {
  return within(screen.getByRole("region", { name: "Elsewhere" }))
    .getAllByRole("link")
    .map((link) => [link.textContent, link.getAttribute("href")]);
}

describe("ContactLinks", () => {
  it("renders every configured social link from the site config", () => {
    render(<ContactLinks />);

    expect(links()).toEqual(
      siteConfig.social.map((link) => [link.label, link.href]),
    );
  });

  it("omits social links without a URL", () => {
    siteConfig.social = [
      { label: "GitHub", href: "https://github.com/example" },
      { label: "LinkedIn", href: null },
    ];
    render(<ContactLinks />);

    expect(links()).toEqual([["GitHub", "https://github.com/example"]]);
  });

  it("has no résumé link while none is configured", () => {
    siteConfig.resumeHref = null;
    render(<ContactLinks />);

    expect(
      screen.queryByRole("link", { name: /resume/i }),
    ).not.toBeInTheDocument();
  });

  it("links the résumé once it is configured", () => {
    siteConfig.resumeHref = "/resume/kshitij-pal-resume.pdf";
    render(<ContactLinks />);

    expect(screen.getByRole("link", { name: "Resume (PDF)" })).toHaveAttribute(
      "href",
      "/resume/kshitij-pal-resume.pdf",
    );
  });

  it("renders nothing when no link is configured", () => {
    siteConfig.social = [{ label: "GitHub", href: null }];
    siteConfig.resumeHref = null;
    const { container } = render(<ContactLinks />);

    expect(container).toBeEmptyDOMElement();
  });
});
