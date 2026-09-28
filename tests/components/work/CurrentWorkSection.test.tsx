import { render, screen, within } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import { CurrentWorkSection } from "@/components/work/CurrentWorkSection";
import type { CurrentWorkItem } from "@/lib/site/currentWork";
import { installIntersectionObserver } from "@/tests/helpers/intersectionObserver";

beforeAll(() => {
  installIntersectionObserver();
});

function getRegion() {
  return screen.getByRole("region", { name: "Currently Working On" });
}

describe("CurrentWorkSection", () => {
  it("renders a region labelled by its h2 and no h1", () => {
    render(<CurrentWorkSection />);

    expect(
      within(getRegion()).getByRole("heading", {
        level: 2,
        name: "Currently Working On",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
  });

  it("renders BillSync as an h3 with its status", () => {
    render(<CurrentWorkSection />);

    expect(
      screen.getByRole("heading", { level: 3, name: "BillSync" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("term")).toHaveTextContent("Status");
    expect(screen.getByRole("definition")).toHaveTextContent(
      "Currently being developed",
    );
  });

  it("renders the approved description", () => {
    render(<CurrentWorkSection />);

    expect(
      screen.getByText(
        "An AI-powered inventory management platform designed to turn business documents into verified, structured operational data.",
      ),
    ).toBeInTheDocument();
  });

  it("renders the focus areas as a list", () => {
    render(<CurrentWorkSection />);

    const heading = screen.getByRole("heading", { level: 4, name: "Focus" });
    const list = heading.nextElementSibling as HTMLElement;
    expect(list.tagName).toBe("UL");
    expect(
      within(list)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual([
      "AI-powered document processing",
      "Human verification workflows",
      "Inventory management",
      "Multi-tenant architecture",
      "Backend systems and data integrity",
    ]);
  });

  it("links to the BillSync case study", () => {
    render(<CurrentWorkSection />);

    const link = screen.getByRole("link", { name: "View project" });
    expect(link).toHaveAttribute("href", "/work/billsync");
    expect(link).toHaveAccessibleDescription("BillSync");
  });

  it("contains no metrics or launch, production, or customer claims", () => {
    render(<CurrentWorkSection />);

    const text = getRegion().textContent;
    expect(text).not.toMatch(/\d/);
    expect(text).not.toMatch(
      /launched|live|in production|production-ready|customers?|clients?|users|accuracy/i,
    );
  });

  it("renders an item without a link when it has no destination", () => {
    const items: CurrentWorkItem[] = [
      {
        name: "Other Project",
        status: "Exploring",
        description: "Another description.",
        focus: ["One area"],
      },
    ];
    render(<CurrentWorkSection items={items} />);

    expect(
      screen.getByRole("heading", { level: 3, name: "Other Project" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
