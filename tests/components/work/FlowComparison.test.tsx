import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import { FlowComparison } from "@/components/work/FlowComparison";
import { installIntersectionObserver } from "@/tests/helpers/intersectionObserver";

beforeAll(() => {
  installIntersectionObserver();
});

describe("FlowComparison", () => {
  it("renders each flow with its caption, steps, and note", () => {
    const { container } = render(
      <FlowComparison
        flows={[
          { caption: "Sync", steps: [{ label: "Wait" }], note: "Blocks." },
          { caption: "Async", steps: [{ label: "Queue" }], note: "Returns." },
        ]}
      />,
    );

    expect(container.querySelectorAll("figure")).toHaveLength(2);
    for (const text of [
      "Sync",
      "Wait",
      "Blocks.",
      "Async",
      "Queue",
      "Returns.",
    ]) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
  });
});
