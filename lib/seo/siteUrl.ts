/**
 * Parses the canonical site origin. Unset or empty means no production
 * domain is configured yet; anything else must be a bare http(s) origin, and
 * a malformed value throws so a misconfigured build fails instead of
 * publishing wrong canonical URLs.
 */
export function parseSiteUrl(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error(`SITE_URL must be an absolute URL, got "${trimmed}".`);
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("SITE_URL must use http or https.");
  }
  if (url.pathname !== "/" || url.search || url.hash || url.username) {
    throw new Error(
      "SITE_URL must be an origin only, for example https://domain.tld.",
    );
  }

  return url.origin;
}

/**
 * The canonical origin, read from `SITE_URL` when the site is built. `null`
 * until the production domain exists; canonical URLs, `og:url`, sitemap
 * entries, and structured-data URLs are omitted while it is unset.
 */
export const siteUrl = parseSiteUrl(process.env.SITE_URL);

/** `/work` → `https://domain.tld/work`, or `null` without a site URL. */
export function absoluteUrl(
  path: string,
  base: string | null = siteUrl,
): string | null {
  return base ? new URL(path, base).href : null;
}
