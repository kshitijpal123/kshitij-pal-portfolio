import type { MDXComponents } from "mdx/types";
import { Link } from "@/components/ui/Link";

/*
 * Markdown elements only. Blocks are spaced by the layout that renders the
 * content, so these add no outer margins beyond extra room above headings.
 */
const components: MDXComponents = {
  h2: (props) => <h2 className="pt-8 font-serif" {...props} />,
  h3: (props) => <h3 className="pt-4" {...props} />,
  p: (props) => <p className="max-w-measure text-body-lg" {...props} />,
  a: ({ href = "", ...props }) => <Link href={href} {...props} />,
  ul: (props) => (
    <ul
      className="max-w-measure list-disc space-y-2 pl-5 text-body-lg marker:text-border-strong"
      {...props}
    />
  ),
  ol: (props) => (
    <ol
      className="max-w-measure list-decimal space-y-2 pl-5 text-body-lg marker:text-muted-foreground"
      {...props}
    />
  ),
  blockquote: (props) => (
    <blockquote
      className="space-y-4 border-l-2 border-border-strong pl-5 text-muted-foreground"
      {...props}
    />
  ),
  strong: (props) => <strong className="font-semibold" {...props} />,
  code: (props) => (
    <code
      className="rounded-control bg-muted px-1 py-0.5 font-mono text-body-sm"
      {...props}
    />
  ),
  // Focusable so keyboard users can scroll long lines; `code` inside a block
  // drops its inline chip styling.
  pre: (props) => (
    <pre
      tabIndex={0}
      className="overflow-x-auto rounded-container border border-border bg-surface-muted p-card font-mono text-body-sm [&>code]:rounded-none [&>code]:bg-transparent [&>code]:p-0"
      {...props}
    />
  ),
};

export function useMDXComponents(): MDXComponents {
  return components;
}
