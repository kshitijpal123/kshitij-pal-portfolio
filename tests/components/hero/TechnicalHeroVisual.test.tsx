import { render, screen, waitFor } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import { TechnicalHeroVisual } from "@/components/hero/TechnicalHeroVisual";
import {
  enterViewport,
  installIntersectionObserver,
} from "@/tests/helpers/intersectionObserver";

beforeAll(() => {
  installIntersectionObserver();
});

function renderVisual() {
  const { container } = render(<TechnicalHeroVisual className="w-full" />);
  const wrapper = container.firstElementChild;
  const svg = container.querySelector("svg");
  if (!wrapper || !svg) throw new Error("visual did not render an svg");
  return { wrapper, svg };
}

describe("TechnicalHeroVisual", () => {
  it("renders a scalable svg diagram", () => {
    const { wrapper, svg } = renderVisual();

    expect(wrapper).toHaveClass("w-full");
    expect(svg).toHaveAttribute("viewBox");
  });

  it("labels the generic system parts and connections", () => {
    const { svg } = renderVisual();

    expect(
      Array.from(svg.querySelectorAll("text"), (text) => text.textContent),
    ).toEqual(
      expect.arrayContaining([
        "REQUEST",
        "API",
        "PROCESS",
        "QUEUE",
        "DATABASE",
        "SERVICE",
        "HTTP",
        "ASYNC",
        "DATA",
      ]),
    );
  });

  it("is decorative and hidden from assistive technology", () => {
    const { wrapper, svg } = renderVisual();

    expect(wrapper).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("focusable", "false");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("introduces no interactive or focusable elements", () => {
    const { wrapper } = renderVisual();

    expect(
      wrapper.querySelectorAll(
        "a, button, input, select, textarea, [tabindex], [role]",
      ),
    ).toHaveLength(0);
  });

  it("contains no real infrastructure, client, or address data", () => {
    const { wrapper } = renderVisual();
    const text = wrapper.textContent;

    expect(text).not.toMatch(
      /digicorp|billsync|aws|azure|gcp|postgres|rabbit|kafka|redis|docker|node\.js|https?:\/\/|\d+\.\d+\.\d+\.\d+|\d+\s*(ms|rps|%)/i,
    );
  });

  it("marks animated parts for the no-script fallback", () => {
    const { svg } = renderVisual();

    const parts = svg.querySelectorAll("[data-motion-reveal]");
    expect(parts.length).toBeGreaterThan(0);
    for (const part of parts) {
      expect(part).toHaveStyle({ opacity: "0" });
    }
  });

  it("becomes fully visible after entering the viewport", async () => {
    const { svg } = renderVisual();

    enterViewport();

    await waitFor(
      () => {
        for (const part of svg.querySelectorAll("[data-motion-reveal]")) {
          expect(part).toHaveStyle({ opacity: "1" });
        }
      },
      { timeout: 3000 },
    );
  });
});
