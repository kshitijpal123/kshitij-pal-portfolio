import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Section } from "@/components/ui/Section";

describe("Section", () => {
  it("renders a section element with its children", () => {
    render(<Section data-testid="section">Content</Section>);

    const section = screen.getByTestId("section");
    expect(section.tagName).toBe("SECTION");
    expect(section).toHaveTextContent("Content");
  });

  it("uses section spacing and no background by default", () => {
    render(<Section data-testid="section">Content</Section>);

    const section = screen.getByTestId("section");
    expect(section).toHaveClass("py-section");
    expect(section).not.toHaveClass("bg-surface-muted");
  });

  it("applies editorial spacing", () => {
    render(
      <Section spacing="editorial" data-testid="section">
        Content
      </Section>,
    );

    const section = screen.getByTestId("section");
    expect(section).toHaveClass("py-editorial");
    expect(section).not.toHaveClass("py-section");
  });

  it("applies the muted surface", () => {
    render(
      <Section muted data-testid="section">
        Content
      </Section>,
    );

    expect(screen.getByTestId("section")).toHaveClass("bg-surface-muted");
  });

  it("becomes a named region when labelled", () => {
    render(
      <Section aria-labelledby="work-heading">
        <h2 id="work-heading">Work</h2>
      </Section>,
    );

    expect(screen.getByRole("region", { name: "Work" })).toBeInTheDocument();
  });
});
