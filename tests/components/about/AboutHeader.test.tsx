import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AboutHeader } from "@/components/about/AboutHeader";
import { siteConfig } from "@/lib/site/config";

const configuredPortrait = siteConfig.portrait;

afterEach(() => {
  siteConfig.portrait = configuredPortrait;
});

function renderHeader() {
  return render(
    <AboutHeader profile={[{ label: "Role", items: ["Engineer"] }]}>
      <p>Introduction.</p>
    </AboutHeader>,
  );
}

describe("AboutHeader", () => {
  it("renders the h1, introduction, and profile", () => {
    renderHeader();

    expect(
      screen.getByRole("heading", { level: 1, name: "About" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Introduction.")).toBeInTheDocument();
    expect(screen.getByRole("term")).toHaveTextContent("Role");
    expect(screen.getByRole("list", { name: "Role" })).toHaveTextContent(
      "Engineer",
    );
  });

  it("renders no image or placeholder while no portrait is configured", () => {
    siteConfig.portrait = null;
    renderHeader();

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("renders the configured portrait with its alt text", () => {
    siteConfig.portrait = {
      src: "/images/portrait.jpg",
      alt: "Portrait of the engineer",
      width: 600,
      height: 750,
    };
    renderHeader();

    expect(
      screen.getByRole("img", { name: "Portrait of the engineer" }),
    ).toBeInTheDocument();
  });
});
