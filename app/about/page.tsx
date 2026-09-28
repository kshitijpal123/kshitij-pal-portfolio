import type { Metadata } from "next";
import { AboutNav } from "@/components/about/AboutNav";
import AboutContent from "@/content/about/index.mdx";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = pageMetadata({
  title: "About",
  description:
    "About Kshitij Pal, a Backend Engineer specializing in Node.js and TypeScript: his engineering focus, how he approaches engineering, and what he is currently exploring.",
  path: "/about",
});

export default function AboutPage() {
  return (
    <>
      <AboutContent />
      <AboutNav />
    </>
  );
}
