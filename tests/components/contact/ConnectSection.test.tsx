import { render, screen, within } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import { ConnectSection } from "@/components/contact/ConnectSection";
import { siteConfig } from "@/lib/site/config";
import { installIntersectionObserver } from "@/tests/helpers/intersectionObserver";

beforeAll(() => {
  installIntersectionObserver();
});

describe("ConnectSection", () => {
  it("renders the eyebrow and a region labelled by its h2", () => {
    render(<ConnectSection />);

    const region = screen.getByRole("region", {
      name: "Let's build something useful.",
    });
    expect(within(region).getByText("Let's connect")).toBeInTheDocument();
    expect(within(region).getByRole("heading", { level: 2 })).toHaveTextContent(
      "Let's build something useful.",
    );
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
  });

  it("renders the approved supporting text", () => {
    render(<ConnectSection />);

    expect(
      screen.getByText(
        "I'm open to backend engineering opportunities, technical conversations, and thoughtful collaboration.",
      ),
    ).toBeInTheDocument();
  });

  it("links to the contact page", () => {
    render(<ConnectSection />);

    expect(screen.getByRole("link", { name: "Get in touch" })).toHaveAttribute(
      "href",
      "/contact",
    );
  });

  it("links only to the contact page and configured profiles", () => {
    render(<ConnectSection />);

    const configured = siteConfig.social.map((link) => link.href);
    for (const link of screen.getAllByRole("link")) {
      const href = link.getAttribute("href");
      expect(href === "/contact" || configured.includes(href)).toBe(true);
    }
    expect(screen.getByRole("link", { name: "LinkedIn" })).toHaveAttribute(
      "href",
      siteConfig.social.find((link) => link.label === "LinkedIn")?.href,
    );
  });
});
