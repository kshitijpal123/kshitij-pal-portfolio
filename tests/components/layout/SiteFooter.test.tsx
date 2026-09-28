import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { siteConfig } from "@/lib/site/config";

const configuredSocial = siteConfig.social;

afterEach(() => {
  siteConfig.social = configuredSocial;
});

describe("SiteFooter", () => {
  it("renders a contentinfo landmark with identity and copyright", () => {
    render(<SiteFooter />);

    const footer = screen.getByRole("contentinfo");
    expect(within(footer).getAllByText("Kshitij Pal")[0]).toBeInTheDocument();
    expect(
      within(footer).getByText(
        new RegExp(`© ${new Date().getFullYear()} Kshitij Pal`),
      ),
    ).toBeInTheDocument();
  });

  it("renders site navigation", () => {
    render(<SiteFooter />);

    const nav = screen.getByRole("navigation", { name: "Footer" });
    expect(within(nav).getAllByRole("link")).toHaveLength(
      siteConfig.nav.length,
    );
  });

  it("renders configured profile links", () => {
    render(<SiteFooter />);

    const profiles = screen.getByRole("navigation", { name: "Profiles" });
    expect(
      within(profiles).getByRole("link", { name: "GitHub" }),
    ).toHaveAttribute("href", "https://github.com/kshitijpal123");
    expect(
      within(profiles).getByRole("link", { name: "LinkedIn" }),
    ).toHaveAttribute(
      "href",
      "https://www.linkedin.com/in/kshitij-pal-963247195",
    );
  });

  it("does not render links without a URL", () => {
    siteConfig.social = [
      { label: "GitHub", href: "https://github.com/kshitijpal123" },
      { label: "LinkedIn", href: null },
    ];
    render(<SiteFooter />);

    expect(screen.getByRole("link", { name: "GitHub" })).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "LinkedIn" }),
    ).not.toBeInTheDocument();
  });

  it("omits the profiles section when nothing is configured", () => {
    siteConfig.social = [];
    render(<SiteFooter />);

    expect(
      screen.queryByRole("navigation", { name: "Profiles" }),
    ).not.toBeInTheDocument();
  });

  it("omits the resume link while no résumé file is configured", () => {
    render(<SiteFooter />);

    expect(
      screen.queryByRole("link", { name: "Resume" }),
    ).not.toBeInTheDocument();
  });
});
