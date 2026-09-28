import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Container } from "@/components/ui/Container";

describe("Container", () => {
  it("renders children centered with the page gutter", () => {
    render(<Container data-testid="container">Content</Container>);

    const container = screen.getByTestId("container");
    expect(container).toHaveTextContent("Content");
    expect(container).toHaveClass("mx-auto", "px-gutter", "max-w-content");
  });

  it.each([
    ["content", "max-w-content"],
    ["wide", "max-w-wide"],
    ["measure", "max-w-measure"],
  ] as const)("applies the %s width", (size, className) => {
    render(
      <Container size={size} data-testid="container">
        Content
      </Container>,
    );

    expect(screen.getByTestId("container")).toHaveClass(className);
  });

  it("has no visual styling", () => {
    render(<Container data-testid="container">Content</Container>);

    expect(screen.getByTestId("container").className).not.toMatch(
      /\b(bg|border|shadow|rounded)-/,
    );
  });
});
