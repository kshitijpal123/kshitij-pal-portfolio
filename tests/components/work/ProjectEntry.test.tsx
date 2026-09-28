import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProjectEntry } from "@/components/work/ProjectEntry";
import { projects, type Project } from "@/lib/content/projects";

const billsync = projects[0] as Project;

describe("ProjectEntry", () => {
  it("renders an article labelled by the project's h2", () => {
    render(<ProjectEntry project={billsync} />);

    expect(screen.getByRole("article", { name: "BillSync" })).toContainElement(
      screen.getByRole("heading", { level: 2, name: "BillSync" }),
    );
    expect(screen.getByText(billsync.summary)).toBeInTheDocument();
  });

  it("links only to the case study when there are no external links", () => {
    render(<ProjectEntry project={billsync} />);

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAccessibleName("Read case study");
    expect(links[0]).toHaveAttribute("href", "/work/billsync");
  });

  it("renders external links when a project declares them", () => {
    render(
      <ProjectEntry
        project={{
          ...billsync,
          links: [{ label: "Repository", href: "https://example.com/repo" }],
        }}
      />,
    );

    const link = screen.getByRole("link", { name: "Repository" });
    expect(link).toHaveAttribute("href", "https://example.com/repo");
    expect(link).toHaveAccessibleDescription("BillSync");
  });
});
