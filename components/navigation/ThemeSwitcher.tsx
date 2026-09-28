"use client";

import { useId, useLayoutEffect, useSyncExternalStore } from "react";
import {
  applyThemePreference,
  getThemePreference,
  setThemePreference,
  subscribeToThemePreference,
  type ThemePreference,
} from "@/lib/theme/preference";

const options: ReadonlyArray<{ value: ThemePreference; label: string }> = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

function getServerPreference(): ThemePreference {
  return "system";
}

/**
 * Light / Dark / System as a native radio group, so arrow keys and the
 * checked state work without custom handling. Instances stay in sync through
 * the shared preference store.
 */
export function ThemeSwitcher() {
  const name = useId();
  const preference = useSyncExternalStore(
    subscribeToThemePreference,
    getThemePreference,
    getServerPreference,
  );

  // The <head> script sets the theme before paint. React's development
  // remount resets <html> attributes, so re-apply it; a no-op in production.
  useLayoutEffect(() => {
    applyThemePreference(getThemePreference());
  }, []);

  return (
    <fieldset>
      <legend className="sr-only">Theme</legend>
      <div className="inline-flex rounded-control border border-border p-0.5">
        {options.map((option) => (
          <label
            key={option.value}
            className="inline-flex min-h-8 cursor-pointer items-center rounded-control px-2.5 text-caption text-muted-foreground transition-colors hover:text-foreground has-checked:bg-muted has-checked:font-medium has-checked:text-foreground has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring"
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={preference === option.value}
              onChange={() => setThemePreference(option.value)}
              className="sr-only"
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
