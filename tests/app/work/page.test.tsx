import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import WorkPage, { metadata } from "@/app/work/page";

describe("WorkPage", () => {
  it("renders Work as the only top-level heading", () => {
    render(<WorkPage />);

    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("Work");
  });

  it("renders BillSync as the first project with its status", () => {
    render(<WorkPage />);

    const list = within(screen.getByRole("region", { name: "Projects" }));
    const [first] = list.getAllByRole("article");
    const entry = within(first as HTMLElement);
    expect(
      entry.getByRole("heading", { level: 2, name: "BillSync" }),
    ).toBeInTheDocument();
    expect(
      entry.getByText("AI-powered inventory management platform"),
    ).toBeInTheDocument();
    expect(entry.getByRole("term")).toHaveTextContent("Status");
    expect(entry.getByRole("definition")).toHaveTextContent(
      "Currently being developed",
    );
  });

  it("lists the key technical areas", () => {
    render(<WorkPage />);

    const heading = screen.getByRole("heading", {
      level: 3,
      name: "Key technical areas",
    });
    const list = heading.nextElementSibling as HTMLElement;
    expect(
      within(list)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual([
      "AI document processing",
      "Human verification workflows",
      "Inventory management",
      "Multi-tenant architecture",
      "PostgreSQL",
      "RabbitMQ",
      "Redis",
      "Docker",
    ]);
  });

  it("links to the BillSync case study", () => {
    render(<WorkPage />);

    const link = screen.getByRole("link", { name: "Read case study" });
    expect(link).toHaveAttribute("href", "/work/billsync");
    expect(link).toHaveAccessibleDescription("BillSync");
  });

  it("defines a page title and description", () => {
    expect(metadata.title).toBe("Kshitij Pal · Work");
    expect(metadata.description).toEqual(expect.any(String));
  });
});
