import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MAIN_CONTENT_ID, SkipLink } from "@/components/navigation/SkipLink";

describe("SkipLink", () => {
  it("points to the main content", () => {
    render(<SkipLink />);

    expect(
      screen.getByRole("link", { name: "Skip to main content" }),
    ).toHaveAttribute("href", `#${MAIN_CONTENT_ID}`);
  });

  it("is visually hidden until focused", () => {
    render(<SkipLink />);

    expect(screen.getByRole("link")).toHaveClass(
      "sr-only",
      "focus:not-sr-only",
    );
  });
});
