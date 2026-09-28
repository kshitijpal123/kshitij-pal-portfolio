import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ThemeSwitcher } from "@/components/navigation/ThemeSwitcher";
import { THEME_STORAGE_KEY } from "@/lib/theme/preference";

afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

describe("ThemeSwitcher", () => {
  it("renders a labelled group with Light, Dark, and System", () => {
    render(<ThemeSwitcher />);

    const group = screen.getByRole("group", { name: "Theme" });
    expect(
      within(group)
        .getAllByRole("radio")
        .map((radio) => radio.getAttribute("value")),
    ).toEqual(["light", "dark", "system"]);
  });

  it("selects System by default", () => {
    render(<ThemeSwitcher />);

    expect(screen.getByRole("radio", { name: "System" })).toBeChecked();
    expect(document.documentElement).not.toHaveAttribute("data-theme");
  });

  it("reflects a stored preference", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    render(<ThemeSwitcher />);

    expect(screen.getByRole("radio", { name: "Dark" })).toBeChecked();
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
  });

  it("changes and persists the theme", () => {
    render(<ThemeSwitcher />);

    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect(screen.getByRole("radio", { name: "Dark" })).toBeChecked();
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");

    fireEvent.click(screen.getByRole("radio", { name: "System" }));
    expect(document.documentElement).not.toHaveAttribute("data-theme");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it("keeps multiple instances in sync", () => {
    render(
      <>
        <ThemeSwitcher />
        <ThemeSwitcher />
      </>,
    );

    fireEvent.click(screen.getAllByRole("radio", { name: "Light" })[0]);

    for (const radio of screen.getAllByRole("radio", { name: "Light" })) {
      expect(radio).toBeChecked();
    }
  });
});
