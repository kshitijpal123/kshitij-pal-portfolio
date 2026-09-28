import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Divider } from "@/components/ui/Divider";

describe("Divider", () => {
  it("renders a semantic separator with the border token", () => {
    render(<Divider />);

    const divider = screen.getByRole("separator");
    expect(divider.tagName).toBe("HR");
    expect(divider).toHaveClass("border-border");
  });

  it("is hidden from assistive technology when decorative", () => {
    const { container } = render(<Divider decorative />);

    expect(screen.queryByRole("separator")).not.toBeInTheDocument();
    expect(container.querySelector("hr")).toHaveAttribute(
      "role",
      "presentation",
    );
  });
});
