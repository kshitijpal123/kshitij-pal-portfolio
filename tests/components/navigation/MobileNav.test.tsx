import { fireEvent, render, screen } from "@testing-library/react";
import { usePathname } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MobileNav } from "@/components/navigation/MobileNav";

vi.mock("next/navigation", () => ({ usePathname: vi.fn() }));

beforeEach(() => {
  vi.mocked(usePathname).mockReturnValue("/");
});

function getTrigger() {
  return screen.getByRole("button", { name: "Menu" });
}

describe("MobileNav", () => {
  it("is closed by default", () => {
    render(<MobileNav />);

    expect(getTrigger()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("controls the panel it toggles", () => {
    render(<MobileNav />);

    const panelId = getTrigger().getAttribute("aria-controls");
    expect(panelId).toBeTruthy();
    expect(document.getElementById(panelId ?? "")).not.toBeVisible();
  });

  it("opens and closes from the trigger", () => {
    render(<MobileNav />);

    fireEvent.click(getTrigger());
    expect(getTrigger()).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("navigation", { name: "Primary" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Theme" })).toBeInTheDocument();

    fireEvent.click(getTrigger());
    expect(getTrigger()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("closes on Escape and returns focus to the trigger", () => {
    render(<MobileNav />);

    fireEvent.click(getTrigger());
    screen.getByRole("link", { name: "Work" }).focus();
    fireEvent.keyDown(document, { key: "Escape" });

    expect(getTrigger()).toHaveAttribute("aria-expanded", "false");
    expect(getTrigger()).toHaveFocus();
  });

  it("closes when a link is followed", () => {
    render(<MobileNav />);

    fireEvent.click(getTrigger());
    fireEvent.click(screen.getByRole("link", { name: "Home" }));

    expect(getTrigger()).toHaveAttribute("aria-expanded", "false");
  });

  it("closes when the route changes", () => {
    const { rerender } = render(<MobileNav />);

    fireEvent.click(getTrigger());
    vi.mocked(usePathname).mockReturnValue("/work");
    rerender(<MobileNav />);

    expect(getTrigger()).toHaveAttribute("aria-expanded", "false");
  });

  it("marks the active route", () => {
    vi.mocked(usePathname).mockReturnValue("/engineering/node-event-loop");
    render(<MobileNav />);

    fireEvent.click(getTrigger());

    expect(screen.getByRole("link", { name: "Engineering" })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });
});
