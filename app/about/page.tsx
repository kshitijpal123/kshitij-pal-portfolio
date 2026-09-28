import type { Metadata } from "next";
import { AboutNav } from "@/components/about/AboutNav";
import AboutContent from "@/content/about/index.mdx";
import { siteConfig } from "@/lib/site/config";

export const metadata: Metadata = {
  title: `About · ${siteConfig.name}`,
  description:
    "About Kshitij Pal, a Backend Engineer focused on backend systems, cloud, distributed systems, and production-oriented engineering.",
};

export default function AboutPage() {
  return (
    <>
      <AboutContent />
      <AboutNav />
    </>
  );
}
