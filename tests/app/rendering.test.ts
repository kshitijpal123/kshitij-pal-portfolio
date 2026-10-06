import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function sourceFiles(directory: string) {
  return readdirSync(directory, { recursive: true, encoding: "utf8" })
    .filter((file) => /\.(ts|tsx)$/.test(file))
    .map((file) => join(directory, file).replaceAll("\\", "/"))
    .sort();
}

function isClient(file: string) {
  return /^\s*["']use client["']/.test(readFileSync(file, "utf8"));
}

describe("server and client boundaries", () => {
  it("keeps every route, layout, and metadata file a Server Component", () => {
    expect(sourceFiles("app").filter(isClient)).toEqual([]);
  });

  it("limits Client Components to interaction, theme, and motion", () => {
    expect(sourceFiles("components").filter(isClient)).toEqual([
      "components/admin/AcceptInvitationForm.tsx",
      "components/admin/InviteForm.tsx",
      "components/admin/LoginForm.tsx",
      "components/admin/SenderRequestForm.tsx",
      "components/admin/SetupForm.tsx",
      "components/contact/ContactForm.tsx",
      "components/experience/JourneyTrajectory.tsx",
      "components/hero/TechnicalHeroVisual.tsx",
      "components/motion/MotionScope.tsx",
      "components/motion/Reveal.tsx",
      "components/motion/Stagger.tsx",
      "components/motion/StaggerItem.tsx",
      "components/navigation/MobileNav.tsx",
      "components/navigation/NavLink.tsx",
      "components/navigation/ThemeSwitcher.tsx",
    ]);
  });

  it("keeps SEO, content, and console modules out of the client", () => {
    expect(
      [
        ...sourceFiles("lib/seo"),
        ...sourceFiles("lib/content"),
        ...sourceFiles("lib/admin"),
      ].filter(isClient),
    ).toEqual([]);
  });
});

describe("private console rendering", () => {
  it("renders every console page per request, never prerendered or cached", () => {
    const pages = sourceFiles("app/admin").filter((file) =>
      file.endsWith("/page.tsx"),
    );
    expect(pages).toHaveLength(7);
    for (const file of pages) {
      expect(readFileSync(file, "utf8"), file).toMatch(
        /from "@\/lib\/admin\/session"/,
      );
    }
  });
});

describe("static rendering", () => {
  it("uses no request-time APIs or dynamic rendering in pages", () => {
    const pages = sourceFiles("app").filter((file) =>
      /\/(page|layout|not-found|sitemap|robots)\.tsx?$/.test(file),
    );
    expect(pages.length).toBeGreaterThan(0);

    for (const file of pages) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(
        /export const dynamic\b|export const revalidate\b|\bcookies\(|\bheaders\(|\bconnection\(|searchParams\)/,
      );
    }
  });

  it("prerenders dynamic segments from content and 404s the rest", () => {
    for (const file of [
      "app/work/[slug]/page.tsx",
      "app/engineering/[slug]/page.tsx",
    ]) {
      const source = readFileSync(file, "utf8");
      expect(source, file).toMatch(/export const dynamicParams = false;/);
      expect(source, file).toMatch(/export function generateStaticParams\(/);
    }
  });
});
