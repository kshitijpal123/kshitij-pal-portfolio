import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { JsonLd } from "@/components/seo/JsonLd";
import { createArticleRegistry } from "@/lib/content/engineering";
import { articleStructuredData } from "@/lib/seo/structuredData";
import { articleFixture } from "@/tests/helpers/articles";

describe("JsonLd", () => {
  it("renders parseable JSON-LD that cannot break out of its script", () => {
    const { articles } = createArticleRegistry([
      articleFixture({ slug: "hostile", title: "</script><img src=x>" }),
    ]);
    const data = articleStructuredData(articles[0], null);
    const { container } = render(<JsonLd data={data} />);

    const scripts = container.querySelectorAll("script");
    expect(scripts).toHaveLength(1);
    expect(scripts[0]).toHaveAttribute("type", "application/ld+json");
    expect(container.querySelector("img")).toBeNull();
    expect(JSON.parse(scripts[0].textContent ?? "")).toEqual(data);
  });
});
