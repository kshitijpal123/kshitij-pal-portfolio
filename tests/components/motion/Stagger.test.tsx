import { render, screen, waitFor, within } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import { Stagger } from "@/components/motion/Stagger";
import { StaggerItem } from "@/components/motion/StaggerItem";
import {
  enterViewport,
  installIntersectionObserver,
} from "@/tests/helpers/intersectionObserver";

beforeAll(() => {
  installIntersectionObserver();
});

const entries = ["Queues", "Databases", "APIs", "Observability"];

function renderList() {
  render(
    <Stagger as="ul" className="grid">
      {entries.map((entry) => (
        <StaggerItem key={entry} as="li">
          <a href={`#${entry}`}>{entry}</a>
        </StaggerItem>
      ))}
    </Stagger>,
  );
  return screen.getByRole("list");
}

describe("Stagger", () => {
  it("renders every child with list semantics intact", () => {
    const list = renderList();

    expect(list.tagName).toBe("UL");
    expect(list).toHaveClass("grid");
    expect(
      within(list)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(entries);
  });

  it("does not hide the group itself", () => {
    const list = renderList();

    expect(list).not.toHaveAttribute("data-motion-reveal");
    expect(list).not.toHaveStyle({ opacity: "0" });
  });

  it("starts items hidden and reveals all of them in the viewport", async () => {
    const list = renderList();
    const items = within(list).getAllByRole("listitem");

    for (const item of items) {
      expect(item).toHaveAttribute("data-motion-reveal");
      expect(item).toHaveStyle({ opacity: "0" });
    }

    enterViewport();

    await waitFor(() => {
      for (const item of items) {
        expect(item).toHaveStyle({ opacity: "1", transform: "none" });
      }
    });
  });

  it("keeps items reachable by keyboard before they are revealed", () => {
    renderList();

    for (const entry of entries) {
      const link = screen.getByRole("link", { name: entry });
      link.focus();
      expect(link).toHaveFocus();
    }
  });

  it("renders a div group of div items by default", () => {
    render(
      <Stagger>
        <StaggerItem>First</StaggerItem>
      </Stagger>,
    );

    const item = screen.getByText("First");
    expect(item.tagName).toBe("DIV");
    expect(item.parentElement?.tagName).toBe("DIV");
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });
});
