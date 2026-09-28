import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Link } from "@/components/ui/Link";

describe("Link", () => {
  it("renders an anchor that preserves href", () => {
    render(<Link href="/work">Work</Link>);

    const link = screen.getByRole("link", { name: "Work" });
    expect(link.tagName).toBe("A");
    expect(link).toHaveAttribute("href", "/work");
  });

  it("renders external links as normal anchors with their attributes", () => {
    render(
      <Link href="https://github.com" target="_blank" rel="noopener noreferrer">
        GitHub
      </Link>,
    );

    const link = screen.getByRole("link", { name: "GitHub" });
    expect(link).toHaveAttribute("href", "https://github.com");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("defaults to an underlined accent inline link", () => {
    render(<Link href="/about">About</Link>);

    expect(screen.getByRole("link")).toHaveClass("text-accent", "underline");
  });

  it.each([
    ["inline", ["text-accent", "underline", "hover:text-accent-hover"]],
    ["nav", ["text-muted-foreground", "min-h-11", "hover:text-foreground"]],
    [
      "subtle",
      ["text-muted-foreground", "underline", "decoration-border-strong"],
    ],
  ] as const)("applies the %s variant", (variant, classes) => {
    render(
      <Link href="/" variant={variant}>
        Link
      </Link>,
    );

    expect(screen.getByRole("link")).toHaveClass(...classes);
  });

  it("exposes the current page to assistive technology", () => {
    render(
      <Link href="/work" variant="nav" aria-current="page">
        Work
      </Link>,
    );

    expect(screen.getByRole("link")).toHaveAttribute("aria-current", "page");
  });

  it("receives keyboard focus", () => {
    render(<Link href="/contact">Contact</Link>);

    const link = screen.getByRole("link");
    link.focus();
    expect(link).toHaveFocus();
  });
});
