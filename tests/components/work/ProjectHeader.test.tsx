import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProjectHeader } from "@/components/work/ProjectHeader";
import { projects, type Project } from "@/lib/content/projects";

const billsync = projects[0] as Project;

describe("ProjectHeader", () => {
  it("renders the title as the h1 of a labelled region", () => {
    render(<ProjectHeader project={billsync} />);

    expect(screen.getByRole("region", { name: "BillSync" })).toContainElement(
      screen.getByRole("heading", { level: 1, name: "BillSync" }),
    );
    expect(screen.getByText(billsync.lede)).toBeInTheDocument();
  });

  it("renders status and focus as a description list", () => {
    render(<ProjectHeader project={billsync} />);

    expect(screen.getAllByRole("term").map((term) => term.textContent)).toEqual(
      ["Status", "Focus"],
    );
    expect(screen.getAllByRole("definition")[0]).toHaveTextContent(
      "Currently being developed",
    );
  });

  it("renders the problem and the solution", () => {
    render(<ProjectHeader project={billsync} />);

    expect(screen.getByText(billsync.problem)).toBeInTheDocument();
    expect(screen.getByText(billsync.solution)).toBeInTheDocument();
  });

  it("uses no motion wrappers above the fold", () => {
    const { container } = render(<ProjectHeader project={billsync} />);

    expect(container.querySelector("[data-motion-reveal]")).toBeNull();
  });
});
