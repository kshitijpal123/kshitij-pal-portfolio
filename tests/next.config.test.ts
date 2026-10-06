// @vitest-environment node
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import nextConfig from "@/next.config";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function allPathHeaders() {
  const rules = (await nextConfig.headers?.()) ?? [];
  return Object.fromEntries(
    rules
      .filter((rule) => rule.source === "/:path*")
      .flatMap((rule) => rule.headers)
      .map(({ key, value }) => [key, value]),
  );
}

describe("next.config", () => {
  it("removes X-Powered-By", () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });

  it("sends the security headers on every path", async () => {
    expect(await allPathHeaders()).toEqual({
      "Strict-Transport-Security": "max-age=31536000",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    });
  });

  it("matches the headers CloudFront adds to static assets from S3", () => {
    const template = readFileSync("infra/portfolio.yaml", "utf8");
    const policy = template.slice(
      template.indexOf("StaticAssetsHeadersPolicy:"),
      template.indexOf(
        "Distribution:",
        template.indexOf("StaticAssetsHeadersPolicy:"),
      ),
    );

    expect(policy).toContain("AccessControlMaxAgeSec: 31536000");
    expect(policy).toContain("IncludeSubdomains: false");
    expect(policy).toContain("Preload: false");
    expect(policy).toContain("ContentTypeOptions:");
    expect(policy).toContain("ReferrerPolicy: strict-origin-when-cross-origin");
    expect(policy).toContain("Value: camera=(), microphone=(), geolocation=()");
  });

  it("asks search engines not to index the private console", async () => {
    const rules = (await nextConfig.headers?.()) ?? [];
    expect(rules.find((rule) => rule.source === "/admin/:path*")).toEqual({
      source: "/admin/:path*",
      headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
    });
  });

  it("accepts Server Actions only from the app's own origin by default", () => {
    expect(nextConfig.experimental?.serverActions?.allowedOrigins).toEqual([]);
  });

  it("accepts Server Actions from the public SITE_URL host behind CloudFront", async () => {
    vi.stubEnv("SITE_URL", "https://portfolio.test");
    const { default: config } = await import("@/next.config");
    expect(config.experimental?.serverActions?.allowedOrigins).toEqual([
      "portfolio.test",
    ]);
  });
});
