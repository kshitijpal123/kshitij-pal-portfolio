export const MAIN_CONTENT_ID = "main-content";

/** Hidden until focused; the first tab stop on every page. */
export function SkipLink() {
  return (
    <a
      href={`#${MAIN_CONTENT_ID}`}
      className="sr-only rounded-control border border-border-strong bg-background text-body-sm font-medium text-foreground focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-10 focus:px-4 focus:py-2"
    >
      Skip to main content
    </a>
  );
}
