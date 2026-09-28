import { render, screen, within } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import { StatusSummary } from "@/components/work/StatusSummary";
import { installIntersectionObserver } from "@/tests/helpers/intersectionObserver";

beforeAll(() => {
  installIntersectionObserver();
});

describe("StatusSummary", () => {
  it("renders each group as an h3 followed by its items", () => {
    render(
      <StatusSummary
        groups={[
          { label: "Established", items: ["Database foundation"] },
          { label: "Planned next", items: ["Workflow", "Hardening"] },
        ]}
      />,
    );

    const headings = screen.getAllByRole("heading", { level: 3 });
    expect(headings.map((h) => h.textContent)).toEqual([
      "Established",
      "Planned next",
    ]);
    const next = headings[1]?.nextElementSibling as HTMLElement;
    expect(
      within(next)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["Workflow", "Hardening"]);
  });
});
