// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { siteConfig } from "@/lib/site/config";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

function sourceFiles(directory: string) {
  return readdirSync(directory, { recursive: true, encoding: "utf8" })
    .filter((file) => /\.(ts|tsx|mdx)$/.test(file))
    .map((file) => join(directory, file).replaceAll("\\", "/"));
}

describe("private console discoverability", { timeout: 30_000 }, () => {
  it("is not linked from any public page, component, or content", () => {
    const publicFiles = [
      ...sourceFiles("app").filter((file) => !file.startsWith("app/admin/")),
      ...sourceFiles("components").filter(
        (file) => !file.startsWith("components/admin/"),
      ),
      ...sourceFiles("content"),
      ...sourceFiles("lib/site"),
      ...sourceFiles("lib/seo"),
    ];
    expect(publicFiles.length).toBeGreaterThan(0);
    for (const file of publicFiles) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/\/admin\b/);
    }
  });

  it("is absent from the navigation, sitemap, and robots.txt", async () => {
    vi.stubEnv("SITE_URL", "https://portfolio.test");
    const [{ default: sitemap }, { default: robots }] = await Promise.all([
      import("@/app/sitemap"),
      import("@/app/robots"),
    ]);

    expect(JSON.stringify(siteConfig)).not.toContain("/admin");
    expect(sitemap().some((entry) => entry.url.includes("/admin"))).toBe(false);
    expect(JSON.stringify(robots())).not.toContain("admin");
  });
});
