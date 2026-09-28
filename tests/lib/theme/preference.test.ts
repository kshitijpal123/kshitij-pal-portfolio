import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getThemePreference,
  setThemePreference,
  subscribeToThemePreference,
  THEME_STORAGE_KEY,
  themeInitScript,
} from "@/lib/theme/preference";

function runInitScript() {
  new Function(themeInitScript)();
}

afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

describe("theme preference", () => {
  it("defaults to system", () => {
    expect(getThemePreference()).toBe("system");
  });

  it("ignores unknown stored values", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "sepia");
    expect(getThemePreference()).toBe("system");
  });

  it("persists light and dark and applies data-theme", () => {
    setThemePreference("dark");

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(getThemePreference()).toBe("dark");
  });

  it("clears the stored value and data-theme for system", () => {
    setThemePreference("light");
    setThemePreference("system");

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    expect(document.documentElement).not.toHaveAttribute("data-theme");
  });

  it("notifies subscribers of changes", () => {
    const onChange = vi.fn();
    const unsubscribe = subscribeToThemePreference(onChange);

    setThemePreference("dark");
    unsubscribe();
    setThemePreference("light");

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("applies changes made in another tab", () => {
    const onChange = vi.fn();
    const unsubscribe = subscribeToThemePreference(onChange);

    window.dispatchEvent(
      new StorageEvent("storage", { key: THEME_STORAGE_KEY, newValue: "dark" }),
    );
    unsubscribe();

    expect(onChange).toHaveBeenCalledOnce();
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
  });
});

describe("themeInitScript", () => {
  it("applies a stored preference", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    runInitScript();

    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
  });

  it("leaves the system default when nothing valid is stored", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "<script>");
    runInitScript();

    expect(document.documentElement).not.toHaveAttribute("data-theme");
  });
});
