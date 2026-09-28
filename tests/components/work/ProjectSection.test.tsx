import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import { ProjectSection } from "@/components/work/ProjectSection";
import { installIntersectionObserver } from "@/tests/helpers/intersectionObserver";

beforeAll(() => {
  installIntersectionObserver();
});

describe("ProjectSection", () => {
  it("renders an anchored region labelled by its h2", () => {
    render(
      <ProjectSection id="problem" label="01" title="The problem">
        <p>Body</p>
      </ProjectSection>,
    );

    const region = screen.getByRole("region", { name: "The problem" });
    expect(region).toHaveAttribute("id", "problem");
    expect(
      screen.getByRole("heading", { level: 2, name: "The problem" }),
    ).toHaveAttribute("id", "problem-heading");
    expect(screen.getByText("01")).toBeInTheDocument();
    expect(screen.getByText("Body")).toBeInTheDocument();
  });

  it("omits the label when none is given", () => {
    render(
      <ProjectSection id="x" title="Title">
        <p>Body</p>
      </ProjectSection>,
    );

    expect(
      screen.getByRole("heading", { level: 2 }).previousSibling,
    ).toBeNull();
  });
});
