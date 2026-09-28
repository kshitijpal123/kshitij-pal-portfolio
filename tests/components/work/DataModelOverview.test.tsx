import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import { DataModelOverview } from "@/components/work/DataModelOverview";
import { installIntersectionObserver } from "@/tests/helpers/intersectionObserver";

beforeAll(() => {
  installIntersectionObserver();
});

describe("DataModelOverview", () => {
  it("renders each group as an h3 with its tables as terms", () => {
    render(
      <DataModelOverview
        groups={[
          {
            name: "Document",
            tables: [
              { name: "bills", description: "Bills." },
              { name: "bill_items", description: "Line items." },
            ],
          },
          {
            name: "Audit",
            tables: [{ name: "audit_events", description: "History." }],
          },
        ]}
      />,
    );

    expect(
      screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent),
    ).toEqual(["Document", "Audit"]);
    expect(screen.getAllByRole("term").map((t) => t.textContent)).toEqual([
      "bills",
      "bill_items",
      "audit_events",
    ]);
    expect(screen.getAllByRole("definition")[1]).toHaveTextContent(
      "Line items.",
    );
  });
});
