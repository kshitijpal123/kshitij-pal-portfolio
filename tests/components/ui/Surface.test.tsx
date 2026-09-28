import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Surface } from "@/components/ui/Surface";

describe("Surface", () => {
  it("renders children in a bordered, padded panel", () => {
    render(<Surface data-testid="surface">Content</Surface>);

    const surface = screen.getByTestId("surface");
    expect(surface).toHaveTextContent("Content");
    expect(surface).toHaveClass(
      "border",
      "border-border",
      "rounded-container",
      "p-card",
    );
  });

  it.each([
    ["default", ["bg-surface"], "shadow-elevated"],
    ["muted", ["bg-surface-muted"], "shadow-elevated"],
    ["elevated", ["bg-surface", "shadow-elevated"], "bg-surface-muted"],
  ] as const)("applies the %s variant", (variant, classes, absent) => {
    render(
      <Surface variant={variant} data-testid="surface">
        Content
      </Surface>,
    );

    const surface = screen.getByTestId("surface");
    expect(surface).toHaveClass(...classes);
    expect(surface).not.toHaveClass(absent);
  });

  it("can leave padding to its content", () => {
    render(
      <Surface padded={false} data-testid="surface">
        Content
      </Surface>,
    );

    expect(screen.getByTestId("surface")).not.toHaveClass("p-card");
  });
});
