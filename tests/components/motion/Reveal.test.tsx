import { render, screen, waitFor } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import { Reveal } from "@/components/motion/Reveal";
import {
  enterViewport,
  installIntersectionObserver,
} from "@/tests/helpers/intersectionObserver";

beforeAll(() => {
  installIntersectionObserver();
});

function renderReveal() {
  render(
    <Reveal className="mt-4">
      <h2>Architecture</h2>
      <a href="/work">View work</a>
    </Reveal>,
  );
  return screen.getByRole("heading", { name: "Architecture" }).parentElement;
}

describe("Reveal", () => {
  it("renders its children before it has been revealed", () => {
    renderReveal();

    expect(
      screen.getByRole("heading", { name: "Architecture" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View work" })).toHaveAttribute(
      "href",
      "/work",
    );
  });

  it("starts in the hidden state, marked for the no-script fallback", () => {
    const wrapper = renderReveal();

    expect(wrapper).toHaveAttribute("data-motion-reveal");
    expect(wrapper).toHaveClass("mt-4");
    expect(wrapper).toHaveStyle({ opacity: "0" });
  });

  it("becomes fully visible after entering the viewport", async () => {
    const wrapper = renderReveal();

    enterViewport();

    await waitFor(() => {
      expect(wrapper).toHaveStyle({ opacity: "1", transform: "none" });
    });
  });

  it("never hides content from assistive technology or the keyboard", () => {
    const wrapper = renderReveal();

    for (const attribute of ["aria-hidden", "hidden", "inert", "tabindex"]) {
      expect(wrapper).not.toHaveAttribute(attribute);
    }

    const link = screen.getByRole("link", { name: "View work" });
    link.focus();
    expect(link).toHaveFocus();
  });
});
