import type { Metadata } from "next";
import { ConnectSection } from "@/components/contact/ConnectSection";
import { ExperienceSection } from "@/components/experience/ExperienceSection";
import { HomeHero } from "@/components/hero/HomeHero";
import { JsonLd } from "@/components/seo/JsonLd";
import { CurrentWorkSection } from "@/components/work/CurrentWorkSection";
import { pageMetadata } from "@/lib/seo/metadata";
import { homeStructuredData } from "@/lib/seo/structuredData";

export const metadata: Metadata = pageMetadata({
  description:
    "Backend Engineer building production-oriented systems with Node.js and TypeScript, focused on architecture, reliability, and real-world engineering constraints.",
  path: "/",
});

export default function HomePage() {
  return (
    <>
      <JsonLd data={homeStructuredData()} />
      <HomeHero />
      <ExperienceSection />
      <CurrentWorkSection />
      <ConnectSection />
    </>
  );
}
