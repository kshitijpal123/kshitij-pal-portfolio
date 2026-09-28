import { render, screen, within } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import { ArchitectureDiagram } from "@/components/work/ArchitectureDiagram";
import { installIntersectionObserver } from "@/tests/helpers/intersectionObserver";

beforeAll(() => {
  installIntersectionObserver();
});

function renderDiagram() {
  return render(
    <ArchitectureDiagram
      caption="Architecture"
      status="Development architecture"
      layers={[
        { nodes: [{ label: "API" }] },
        { nodes: [{ label: "Broker", technology: "RabbitMQ" }] },
        {
          label: "Outputs",
          nodes: [{ label: "Extraction" }, { label: "Storage" }],
        },
      ]}
      supporting={{ label: "Supporting", nodes: [{ label: "Redis" }] }}
    />,
  );
}

describe("ArchitectureDiagram", () => {
  it("renders the caption and the status qualifier", () => {
    renderDiagram();

    expect(screen.getByText("Architecture").tagName).toBe("FIGCAPTION");
    expect(screen.getByText("Development architecture")).toBeInTheDocument();
  });

  it("renders layers as an ordered list with hidden arrows between them", () => {
    const { container } = renderDiagram();

    const layers = container.querySelector("ol") as HTMLElement;
    expect(layers.children).toHaveLength(3);
    expect(layers.querySelectorAll("svg[aria-hidden='true']")).toHaveLength(2);
    expect(layers).toHaveTextContent("RabbitMQ");
  });

  it("names grouped layers so parallel nodes read as one group", () => {
    renderDiagram();

    expect(
      within(screen.getByRole("list", { name: "Outputs" }))
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["Extraction", "Storage"]);
    expect(screen.getByRole("list", { name: "Supporting" })).toHaveTextContent(
      "Redis",
    );
  });
});
