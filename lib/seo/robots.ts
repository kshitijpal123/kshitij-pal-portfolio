import type { MetadataRoute } from "next";

/** Everything public is crawlable; the sitemap is listed once it has URLs. */
export function buildRobots(base: string | null): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/api/" },
    ...(base && { sitemap: `${base}/sitemap.xml` }),
  };
}
