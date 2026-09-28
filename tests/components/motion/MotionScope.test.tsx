import { render, screen, waitFor, within } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { Reveal } from "@/components/motion/Reveal";
import { Stagger } from "@/components/motion/Stagger";
import { StaggerItem } from "@/components/motion/StaggerItem";
import {
  enterViewport,
  installIntersectionObserver,
} from "@/tests/helpers/intersectionObserver";

// Motion reads the preference once per module graph, so it is set up front.
beforeAll(() => {
  installIntersectionObserver();
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === "(prefers-reduced-motion)",
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("MotionScope with prefers-reduced-motion", () => {
  it("skips the rise immediately and still ends fully visible", async () => {
    render(
      <Reveal>
        <p>Content</p>
      </Reveal>,
    );
    const wrapper = screen.getByText("Content").parentElement;

    enterViewport();

    await waitFor(() => {
      expect(wrapper).toHaveStyle({ transform: "none" });
    });
    expect(wrapper).not.toHaveStyle({ opacity: "1" });

    await waitFor(() => {
      expect(wrapper).toHaveStyle({ opacity: "1" });
    });
  });

  it("renders and reveals every staggered item", async () => {
    render(
      <Stagger as="ol">
        <StaggerItem as="li">One</StaggerItem>
        <StaggerItem as="li">Two</StaggerItem>
      </Stagger>,
    );
    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(items).toHaveLength(2);

    enterViewport();

    await waitFor(() => {
      for (const item of items) {
        expect(item).toHaveStyle({ opacity: "1", transform: "none" });
      }
    });
  });
});
