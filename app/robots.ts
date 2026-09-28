import type { MetadataRoute } from "next";
import { buildRobots } from "@/lib/seo/robots";
import { siteUrl } from "@/lib/seo/siteUrl";

export default function robots(): MetadataRoute.Robots {
  return buildRobots(siteUrl);
}
