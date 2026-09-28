import type { Metadata } from "next";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/font/google", () => {
  const font = () => ({ variable: "font" });
  return { IBM_Plex_Sans: font, IBM_Plex_Mono: font, Source_Serif_4: font };
});

const base = "https://portfolio.test";
const articleSlug = "ai-extraction-is-not-the-source-of-truth";

function params(slug: string) {
  return {
    params: Promise.resolve({ slug }),
    searchParams: Promise.resolve({}),
  };
}

/** Every public route's metadata, read from the route modules themselves. */
async function loadRoutes(): Promise<Record<string, Metadata>> {
  const [
    home,
    work,
    project,
    engineering,
    article,
    experience,
    about,
    contact,
  ] = await Promise.all([
    import("@/app/page"),
    import("@/app/work/page"),
    import("@/app/work/[slug]/page"),
    import("@/app/engineering/page"),
    import("@/app/engineering/[slug]/page"),
    import("@/app/experience/page"),
    import("@/app/about/page"),
    import("@/app/contact/page"),
  ]);

  return {
    "/": home.metadata,
    "/work": work.metadata,
    "/work/billsync": await project.generateMetadata(params("billsync")),
    "/engineering": engineering.metadata,
    [`/engineering/${articleSlug}`]: await article.generateMetadata(
      params(articleSlug),
    ),
    "/experience": experience.metadata,
    "/about": about.metadata,
    "/contact": contact.metadata,
  };
}

/** The document title after the root layout's template is applied. */
async function documentTitle(title: Metadata["title"]) {
  const { metadata: root } = await import("@/app/layout");
  const rootTitle = root.title;
  if (
    !rootTitle ||
    typeof rootTitle !== "object" ||
    !("template" in rootTitle) ||
    !rootTitle.template
  ) {
    throw new Error("The root layout must define a title template.");
  }
  if (typeof title === "string") {
    return rootTitle.template.replace("%s", title);
  }
  if (title && typeof title === "object" && "absolute" in title) {
    return title.absolute;
  }
  throw new Error("Every route must set a title.");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

// Each test imports every route afresh, compiling their MDX.
describe("route metadata", { timeout: 30_000 }, () => {
  it("gives every public route a unique title and description", async () => {
    const routes = await loadRoutes();
    const titles = await Promise.all(
      Object.values(routes).map((metadata) => documentTitle(metadata.title)),
    );
    const descriptions = Object.values(routes).map(
      (metadata) => metadata.description,
    );

    expect(titles).toEqual([
      "Kshitij Pal · Backend Engineer",
      "Work · Kshitij Pal",
      "BillSync · AI-Powered Inventory Engineering Case Study · Kshitij Pal",
      "Engineering · Kshitij Pal",
      "Why AI extraction should not become your source of truth · Kshitij Pal",
      "Experience · Kshitij Pal",
      "About · Kshitij Pal",
      "Contact · Kshitij Pal",
    ]);
    expect(new Set(descriptions).size).toBe(descriptions.length);
    for (const description of descriptions) {
      expect(description).toEqual(expect.any(String));
      expect(description).not.toMatch(/welcome to my portfolio/i);
    }
  });

  it("emits no canonical or og:url while no site URL is configured", async () => {
    for (const metadata of Object.values(await loadRoutes())) {
      expect(metadata).not.toHaveProperty("alternates");
      expect(metadata.openGraph).not.toHaveProperty("url");
    }
  });

  it("gives every route its own canonical URL once SITE_URL is set", async () => {
    vi.stubEnv("SITE_URL", base);
    const routes = await loadRoutes();

    for (const [path, metadata] of Object.entries(routes)) {
      const url = new URL(path, base).href;
      expect(metadata.alternates).toEqual({ canonical: url });
      expect(metadata.openGraph).toMatchObject({
        url,
        siteName: "Kshitij Pal",
        locale: "en_US",
      });
      expect(metadata.twitter).toMatchObject({ card: "summary" });
    }

    const { metadata: root } = await import("@/app/layout");
    expect(root.metadataBase).toEqual(new URL(base));
  });

  it("marks only the article route as an Open Graph article", async () => {
    const routes = await loadRoutes();
    const types = Object.fromEntries(
      Object.entries(routes).map(([path, metadata]) => [
        path,
        metadata.openGraph && "type" in metadata.openGraph
          ? metadata.openGraph.type
          : undefined,
      ]),
    );

    expect(types[`/engineering/${articleSlug}`]).toBe("article");
    expect(
      Object.entries(types).filter(([, type]) => type === "article"),
    ).toHaveLength(1);
    expect(routes[`/engineering/${articleSlug}`].openGraph).toMatchObject({
      publishedTime: "2026-09-28",
    });
  });

  it("describes nothing for an unknown project or article", async () => {
    const [project, article] = await Promise.all([
      import("@/app/work/[slug]/page"),
      import("@/app/engineering/[slug]/page"),
    ]);
    expect(await project.generateMetadata(params("unknown"))).toEqual({});
    expect(await article.generateMetadata(params("unknown"))).toEqual({});
  });
});

describe("sitemap.xml and robots.txt routes", { timeout: 30_000 }, () => {
  it("serve an empty sitemap and no sitemap reference without SITE_URL", async () => {
    const [{ default: sitemap }, { default: robots }] = await Promise.all([
      import("@/app/sitemap"),
      import("@/app/robots"),
    ]);

    expect(sitemap()).toEqual([]);
    expect(robots()).toEqual({
      rules: { userAgent: "*", allow: "/", disallow: "/api/" },
    });
  });

  it("list the public URLs and reference the sitemap with SITE_URL", async () => {
    vi.stubEnv("SITE_URL", base);
    const [{ default: sitemap }, { default: robots }] = await Promise.all([
      import("@/app/sitemap"),
      import("@/app/robots"),
    ]);

    const urls = sitemap().map((entry) => entry.url);
    expect(urls).toHaveLength(8);
    expect(urls).toContain(`${base}/engineering/${articleSlug}`);
    expect(urls.every((url) => url.startsWith(`${base}/`))).toBe(true);
    expect(robots().sitemap).toBe(`${base}/sitemap.xml`);
  });
});
