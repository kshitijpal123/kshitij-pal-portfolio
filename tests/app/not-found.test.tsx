import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import NotFound, { metadata } from "@/app/not-found";

describe("NotFound", () => {
  it("has one h1 naming the page and a way back home", () => {
    render(<NotFound />);

    const h1 = document.querySelectorAll("h1");
    expect(h1).toHaveLength(1);
    expect(
      screen.getByRole("region", { name: "Page not found" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Home" })).toHaveAttribute(
      "href",
      "/",
    );
  });

  it("is titled as a missing page, with no canonical or social metadata", () => {
    expect(metadata).toEqual({ title: "Page not found" });
  });
});
