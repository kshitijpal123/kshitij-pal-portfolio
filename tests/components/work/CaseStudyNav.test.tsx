import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CaseStudyNav } from "@/components/work/CaseStudyNav";

describe("CaseStudyNav", () => {
  it("renders a named navigation landmark back to Work and to Contact", () => {
    render(<CaseStudyNav />);

    expect(
      screen.getByRole("navigation", { name: "Case study" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Work" })).toHaveAttribute(
      "href",
      "/work",
    );
    expect(screen.getByRole("link", { name: "Let's connect" })).toHaveAttribute(
      "href",
      "/contact",
    );
  });
});
