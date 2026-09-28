/**
 * Joins class names, skipping falsy values. It does not resolve conflicting
 * utilities, so a caller's `className` should add classes, not override them.
 */
export function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}
