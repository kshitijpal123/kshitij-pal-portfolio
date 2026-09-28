import { render, screen, within } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import { FlowDiagram } from "@/components/work/FlowDiagram";
import { installIntersectionObserver } from "@/tests/helpers/intersectionObserver";

beforeAll(() => {
  installIntersectionObserver();
});

describe("FlowDiagram", () => {
  it("renders a captioned figure with the steps as an ordered list", () => {
    const { container } = render(
      <FlowDiagram
        caption="Flow"
        steps={[
          { label: "Upload", description: "Enters the system." },
          { label: "Store", detail: "bills", highlight: true },
        ]}
      />,
    );

    const figure = container.querySelector("figure") as HTMLElement;
    expect(within(figure).getByText("Flow").tagName).toBe("FIGCAPTION");
    const list = within(figure).getByRole("list");
    expect(list.tagName).toBe("OL");
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Enters the system.");
    expect(within(items[1] as HTMLElement).getByText("bills").tagName).toBe(
      "CODE",
    );
  });

  it("hides the drawn step numbers and rail from assistive technology", () => {
    const { container } = render(
      <FlowDiagram caption="Flow" steps={[{ label: "A" }, { label: "B" }]} />,
    );

    const hidden = container.querySelectorAll("[aria-hidden='true']");
    expect(hidden).toHaveLength(2);
    expect(hidden[0]).toHaveTextContent("1");
    expect(screen.getByText("A")).not.toHaveAttribute("aria-hidden");
  });
});
