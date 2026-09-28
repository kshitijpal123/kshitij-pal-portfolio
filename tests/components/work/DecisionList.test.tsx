import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import { DecisionList } from "@/components/work/DecisionList";
import { installIntersectionObserver } from "@/tests/helpers/intersectionObserver";

beforeAll(() => {
  installIntersectionObserver();
});

describe("DecisionList", () => {
  it("renders an ordered list of decisions, each an h3 with its rationale", () => {
    render(
      <DecisionList
        decisions={[
          { decision: "First decision.", why: "First reason." },
          { decision: "Second decision.", why: "Second reason." },
        ]}
      />,
    );

    expect(screen.getByRole("list").tagName).toBe("OL");
    expect(
      screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent),
    ).toEqual(["First decision.", "Second decision."]);
    expect(screen.getAllByRole("listitem")[1]).toHaveTextContent(
      "WhySecond reason.",
    );
  });
});
