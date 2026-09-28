import { createElement } from "react";
import type { ArticleDefinition } from "@/lib/content/engineering";

/** A minimal valid article definition; its body is one paragraph. */
export function articleFixture(
  overrides: Partial<ArticleDefinition> & Pick<ArticleDefinition, "slug">,
): ArticleDefinition {
  return {
    title: `Title of ${overrides.slug}`,
    description: `Description of ${overrides.slug}.`,
    publishedAt: "2026-01-01",
    readingTime: 3,
    status: "published",
    Content: () => createElement("p", null, `Body of ${overrides.slug}`),
    ...overrides,
  };
}
