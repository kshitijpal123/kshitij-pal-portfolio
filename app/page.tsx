import type { Metadata } from "next";
import { ExperienceSection } from "@/components/experience/ExperienceSection";
import { HomeHero } from "@/components/hero/HomeHero";
import { siteConfig } from "@/lib/site/config";

export const metadata: Metadata = {
  title: `${siteConfig.name} · ${siteConfig.role}`,
  description:
    "Backend Engineer building production-oriented systems with Node.js and TypeScript, focused on architecture, reliability, and real-world engineering constraints.",
};

export default function HomePage() {
  return (
    <>
      <HomeHero />
      <ExperienceSection />
    </>
  );
}
