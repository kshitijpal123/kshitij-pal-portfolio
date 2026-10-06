/*
 * Deliberately tiny: three placeholders, no expressions, filters, defaults,
 * or nesting. Anything that is not exactly one of them is an error, so text
 * is never sent with a placeholder silently dropped or left unresolved.
 * Pure, so the compose preview in the browser runs the same code as the
 * server, which always re-checks before sending.
 */

export const placeholderNames = ["name", "email", "company"] as const;

export type PlaceholderName = (typeof placeholderNames)[number];

export type PersonalizationValues = Record<PlaceholderName, string | null>;

export type PlaceholderProblem = {
  kind: "unknown" | "malformed" | "missing";
  /** As written in the template, shortened; shown to the user as text. */
  placeholder: string;
  recipient?: string;
};

export type PersonalizationResult =
  { ok: true; text: string } | { ok: false; problem: PlaceholderProblem };

const placeholderPattern = /\{\{\s*([^{}]*?)\s*\}\}/g;

function isPlaceholderName(value: string): value is PlaceholderName {
  return (placeholderNames as readonly string[]).includes(value);
}

function shorten(value: string) {
  return value.length > 40 ? `${value.slice(0, 39)}…` : value;
}

/**
 * The first unsupported or malformed placeholder in `text`, or `null`.
 * Stray `{{` or `}}` outside a placeholder count as malformed.
 */
export function findTemplateProblem(text: string): PlaceholderProblem | null {
  for (const match of text.matchAll(placeholderPattern)) {
    if (!isPlaceholderName(match[1])) {
      return { kind: "unknown", placeholder: shorten(match[0]) };
    }
  }
  const rest = text.replace(placeholderPattern, "");
  if (rest.includes("{{") || rest.includes("}}")) {
    return { kind: "malformed", placeholder: "{{" };
  }
  return null;
}

/**
 * Replaces each placeholder with the recipient's value in one pass; values
 * are inserted literally and never scanned again. Fails, rather than
 * guessing, when a placeholder is unknown, malformed, or has no value.
 */
export function personalize(
  text: string,
  values: PersonalizationValues,
): PersonalizationResult {
  const problem = findTemplateProblem(text);
  if (problem) return { ok: false, problem };

  const missing: string[] = [];
  const resolved = text.replace(placeholderPattern, (match, name: string) => {
    const value = values[name as PlaceholderName];
    if (!value) {
      missing.push(name);
      return match;
    }
    return value;
  });
  return missing.length > 0
    ? {
        ok: false,
        problem: {
          kind: "missing",
          placeholder: `{{${missing[0]}}}`,
          recipient: values.email ?? undefined,
        },
      }
    : { ok: true, text: resolved };
}
