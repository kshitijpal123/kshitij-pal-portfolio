import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Badge } from "@/components/ui/Badge";

describe("Badge", () => {
  it("renders its label as compact mono text", () => {
    render(<Badge>TypeScript</Badge>);

    const badge = screen.getByText("TypeScript");
    expect(badge.tagName).toBe("SPAN");
    expect(badge).toHaveClass("font-mono", "text-meta", "rounded-control");
    expect(badge).not.toHaveClass("rounded-full");
  });

  it.each([
    ["default", ["border-border", "bg-surface", "text-foreground"]],
    ["accent", ["border-accent", "text-accent"]],
    ["muted", ["bg-muted", "text-muted-foreground"]],
  ] as const)("applies the %s variant", (variant, classes) => {
    render(<Badge variant={variant}>Label</Badge>);

    expect(screen.getByText("Label")).toHaveClass(...classes);
  });
});
