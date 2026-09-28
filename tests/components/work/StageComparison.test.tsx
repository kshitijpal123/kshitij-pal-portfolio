import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import { StageComparison } from "@/components/work/StageComparison";
import { installIntersectionObserver } from "@/tests/helpers/intersectionObserver";

beforeAll(() => {
  installIntersectionObserver();
});

const stages = [
  { label: "Document", role: "Evidence", description: "As received." },
  { label: "Extraction", role: "Interpretation", description: "Proposed." },
  { label: "Verified", role: "Truth", description: "Approved." },
];

describe("StageComparison", () => {
  it("renders every stage as a list item with its role and description", () => {
    render(<StageComparison caption="Stages" stages={stages} />);

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[1]).toHaveTextContent("ExtractionInterpretationProposed.");
  });

  it("draws a hidden separator between stages only", () => {
    const { container } = render(
      <StageComparison caption="Stages" stages={stages} />,
    );

    const separators = container.querySelectorAll("[aria-hidden='true']");
    expect(separators).toHaveLength(2);
    expect(separators[0]).toHaveTextContent("≠");
  });
});
