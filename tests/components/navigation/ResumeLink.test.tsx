import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ResumeLink } from "@/components/navigation/ResumeLink";
import { siteConfig } from "@/lib/site/config";

const configuredResumeHref = siteConfig.resumeHref;

afterEach(() => {
  siteConfig.resumeHref = configuredResumeHref;
});

describe("ResumeLink", () => {
  it("has no résumé configured until the real PDF is added", () => {
    expect(siteConfig.resumeHref).toBeNull();
  });

  it("renders nothing while no résumé is configured", () => {
    siteConfig.resumeHref = null;
    const { container } = render(<ResumeLink />);

    expect(container).toBeEmptyDOMElement();
  });

  it("links to the configured résumé path", () => {
    siteConfig.resumeHref = "/resume/kshitij-pal-resume.pdf";
    render(<ResumeLink />);

    expect(screen.getByRole("link", { name: "Resume" })).toHaveAttribute(
      "href",
      "/resume/kshitij-pal-resume.pdf",
    );
  });
});
