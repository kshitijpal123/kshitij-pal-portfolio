import { describe, expect, it } from "vitest";
import { absoluteUrl, parseSiteUrl, siteUrl } from "@/lib/seo/siteUrl";

describe("parseSiteUrl", () => {
  it("treats a missing or blank value as no configured domain", () => {
    expect(parseSiteUrl(undefined)).toBeNull();
    expect(parseSiteUrl("")).toBeNull();
    expect(parseSiteUrl("   ")).toBeNull();
  });

  it("normalizes an origin, dropping a trailing slash", () => {
    expect(parseSiteUrl("https://portfolio.test")).toBe(
      "https://portfolio.test",
    );
    expect(parseSiteUrl(" https://portfolio.test/ ")).toBe(
      "https://portfolio.test",
    );
  });

  it.each([
    ["not a URL", "portfolio.test"],
    ["a non-http scheme", "ftp://portfolio.test"],
    ["a path", "https://portfolio.test/blog"],
    ["a query", "https://portfolio.test/?a=1"],
    ["a hash", "https://portfolio.test/#top"],
  ])("rejects %s", (_, value) => {
    expect(() => parseSiteUrl(value)).toThrow(/SITE_URL/);
  });
});

describe("siteUrl", () => {
  it("is unset in the repository: no production domain is invented", () => {
    expect(siteUrl).toBeNull();
  });
});

describe("absoluteUrl", () => {
  it("joins a path onto the origin", () => {
    expect(absoluteUrl("/", "https://portfolio.test")).toBe(
      "https://portfolio.test/",
    );
    expect(absoluteUrl("/work/billsync", "https://portfolio.test")).toBe(
      "https://portfolio.test/work/billsync",
    );
  });

  it("returns null without a site URL", () => {
    expect(absoluteUrl("/work", null)).toBeNull();
    expect(absoluteUrl("/work")).toBeNull();
  });
});
