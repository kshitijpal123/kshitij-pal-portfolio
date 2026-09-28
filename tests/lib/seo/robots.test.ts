import { describe, expect, it } from "vitest";
import { buildRobots } from "@/lib/seo/robots";

describe("buildRobots", () => {
  it("allows every public page and keeps crawlers out of the API", () => {
    expect(buildRobots(null)).toEqual({
      rules: { userAgent: "*", allow: "/", disallow: "/api/" },
    });
  });

  it("references the sitemap once the site URL is known", () => {
    expect(buildRobots("https://portfolio.test")).toEqual({
      rules: { userAgent: "*", allow: "/", disallow: "/api/" },
      sitemap: "https://portfolio.test/sitemap.xml",
    });
  });
});
