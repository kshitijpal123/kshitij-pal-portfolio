import { render, screen, within } from "@testing-library/react";
import { usePathname } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SiteHeader } from "@/components/layout/SiteHeader";

vi.mock("next/navigation", () => ({ usePathname: vi.fn() }));

beforeEach(() => {
  vi.mocked(usePathname).mockReturnValue("/");
});

function getPrimaryNav() {
  return screen.getByRole("navigation", { name: "Primary" });
}

describe("SiteHeader", () => {
  it("renders a banner with a wordmark linking home", () => {
    render(<SiteHeader />);

    const banner = screen.getByRole("banner");
    expect(
      within(banner).getByRole("link", { name: /Kshitij Pal/ }),
    ).toHaveAttribute("href", "/");
  });

  it("renders the primary routes in order", () => {
    render(<SiteHeader />);

    const links = within(getPrimaryNav()).getAllByRole("link");
    expect(
      links.map((link) => [link.textContent, link.getAttribute("href")]),
    ).toEqual([
      ["Home", "/"],
      ["Work", "/work"],
      ["Experience", "/experience"],
      ["Engineering", "/engineering"],
      ["About", "/about"],
      ["Contact", "/contact"],
    ]);
  });

  it("marks only the current route as the current page", () => {
    vi.mocked(usePathname).mockReturnValue("/about");
    render(<SiteHeader />);

    const nav = getPrimaryNav();
    expect(within(nav).getByRole("link", { name: "About" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(nav).getByRole("link", { name: "Home" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("marks Experience as the current page only on /experience", () => {
    vi.mocked(usePathname).mockReturnValue("/experience");
    render(<SiteHeader />);

    const nav = getPrimaryNav();
    expect(
      within(nav).getByRole("link", { name: "Experience" }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      within(nav)
        .getAllByRole("link")
        .filter((link) => link.hasAttribute("aria-current")),
    ).toHaveLength(1);
  });

  it("activates the parent item on nested routes", () => {
    vi.mocked(usePathname).mockReturnValue("/work/billsync");
    render(<SiteHeader />);

    const work = within(getPrimaryNav()).getByRole("link", { name: "Work" });
    expect(work).toHaveAttribute("aria-current", "true");
    expect(work).toHaveAttribute("data-active");
  });

  it("includes the theme switcher and the mobile menu trigger", () => {
    render(<SiteHeader />);

    expect(screen.getByRole("group", { name: "Theme" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Menu" })).toBeInTheDocument();
  });

  it("omits the resume link while no résumé file is configured", () => {
    render(<SiteHeader />);

    expect(
      screen.queryByRole("link", { name: "Resume" }),
    ).not.toBeInTheDocument();
  });
});
