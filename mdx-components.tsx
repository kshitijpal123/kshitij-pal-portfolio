import type { MDXComponents } from "mdx/types";

/*
 * Markdown elements only. Blocks are spaced by the layout that renders the
 * content, so these add no outer margins.
 */
const components: MDXComponents = {
  h3: (props) => <h3 className="pt-4" {...props} />,
  p: (props) => <p className="max-w-measure text-body-lg" {...props} />,
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
  strong: (props) => <strong className="font-semibold" {...props} />,
  code: (props) => (
    <code
      className="rounded-control bg-muted px-1 py-0.5 font-mono text-body-sm"
      {...props}
    />
  ),
};

export function useMDXComponents(): MDXComponents {
  return components;
}
