import type { MetadataRoute } from "next";
import { buildSitemap } from "@/lib/seo/sitemap";
import { siteUrl } from "@/lib/seo/siteUrl";

export default function sitemap(): MetadataRoute.Sitemap {
  return buildSitemap(siteUrl);
}
