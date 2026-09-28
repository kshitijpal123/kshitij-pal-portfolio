import { render, screen, within } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import AboutPage, { metadata } from "@/app/about/page";
import { installIntersectionObserver } from "@/tests/helpers/intersectionObserver";

beforeAll(() => {
  installIntersectionObserver();
});

function getSection(name: string) {
  return within(screen.getByRole("region", { name }));
}

describe("AboutPage", () => {
  it("renders About as the only top-level heading", () => {
    render(<AboutPage />);

    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("About");
  });

  it("renders the sections in order as h2 headings", () => {
    render(<AboutPage />);

    expect(
      screen.getAllByRole("region").map((region) => region.id || null),
    ).toEqual([
      null,
      "engineering-focus",
      "engineering-approach",
      "currently-exploring",
    ]);
    expect(
      screen
        .getAllByRole("heading", { level: 2 })
        .map((heading) => heading.textContent),
    ).toEqual([
      "Engineering Focus",
      "How I Think About Engineering",
      "Currently Exploring",
    ]);
  });

  it("introduces the engineer professionally", () => {
    render(<AboutPage />);

    const intro = getSection("About");
    expect(
      intro.getByText(
        /I'm a Backend Engineer specializing in Node\.js and TypeScript\./,
      ),
    ).toBeInTheDocument();
    expect(intro.getByRole("link", { name: "Experience" })).toHaveAttribute(
      "href",
      "/experience",
    );
    expect(intro.getAllByRole("term").map((term) => term.textContent)).toEqual([
      "Role",
      "Specialization",
      "Core interests",
    ]);
    expect(
      within(intro.getByRole("list", { name: "Core interests" }))
        .getAllByRole("listitem")
        .map((item) => item.textContent.replace("·", "").trim()),
    ).toEqual(["Backend Systems", "Cloud", "Distributed Systems"]);
  });

  it("describes the progression across all three roles", () => {
    render(<AboutPage />);

    const text = getSection("About").getByText(/The 10x Academy/).textContent;
    expect(text).toMatch(/started with full-stack development/);
    expect(text).toContain("Digicorp Information Systems");
    expect(text).toContain("Khaitan & Co");
    expect(document.body.textContent).not.toMatch(/Express\.js/);
  });

  it("describes the engineering focus", () => {
    render(<AboutPage />);

    const focus = getSection("Engineering Focus");
    expect(focus.getByText("Asynchronous processing.")).toBeInTheDocument();
    expect(
      focus.getByText("Distributed systems and reliability."),
    ).toBeInTheDocument();
    expect(
      focus.getByText("Cloud infrastructure and delivery."),
    ).toBeInTheDocument();
  });

  it("states the engineering principle", () => {
    render(<AboutPage />);

    const approach = getSection("How I Think About Engineering");
    expect(
      approach.getByText("Show the engineering, don't advertise it."),
    ).toBeInTheDocument();
    for (const term of ["Trade-offs.", "Reliability.", "Data integrity."]) {
      expect(approach.getByText(term)).toBeInTheDocument();
    }
  });

  it("lists current focus areas and links to BillSync", () => {
    render(<AboutPage />);

    const exploring = getSection("Currently Exploring");
    expect(
      exploring.getAllByRole("listitem").map((item) => item.textContent),
    ).toEqual([
      "Backend architecture and system design",
      "Distributed systems",
      "Node.js internals",
      "Cloud infrastructure",
      "AI-assisted document processing",
      "Reliable data workflows",
    ]);
    expect(exploring.getByRole("link", { name: "BillSync" })).toHaveAttribute(
      "href",
      "/work/billsync",
    );
  });

  it("contains no personal section, unsupported duration, or rating", () => {
    render(<AboutPage />);

    expect(
      screen.queryByRole("heading", {
        name: /outside|personal|hobbies|beyond the code/i,
      }),
    ).not.toBeInTheDocument();
    const text = document.body.textContent;
    expect(text).not.toMatch(/\b\d+(\.\d+)?\+?\s*(years?|yrs?)\b/i);
    expect(text).not.toMatch(/passionate|expert|ninja|rockstar/i);
  });

  it("renders no image while no portrait is configured", () => {
    render(<AboutPage />);

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("closes with links to Experience, Work, and Contact", () => {
    render(<AboutPage />);

    const nav = within(screen.getByRole("navigation", { name: "Related" }));
    expect(
      nav.getAllByRole("link").map((link) => link.getAttribute("href")),
    ).toEqual(["/experience", "/work", "/contact"]);
  });

  it("defines the page title and description", () => {
    expect(metadata.title).toBe("About · Kshitij Pal");
    expect(metadata.description).toBe(
      "About Kshitij Pal, a Backend Engineer focused on backend systems, cloud, distributed systems, and production-oriented engineering.",
    );
  });
});
