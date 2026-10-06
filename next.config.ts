import createMDX from "@next/mdx";
import type { NextConfig } from "next";
import { parseSiteUrl } from "@/lib/seo/siteUrl";

/*
 * Only headers that cannot affect rendering. A Content Security Policy is
 * deliberately absent: the inline theme script and JSON-LD need hashes or
 * nonces. HSTS omits `includeSubDomains` and `preload`, which would bind
 * hostnames this site does not serve. CloudFront repeats these values for
 * `/_next/static/*`, which it serves from S3 (`infra/portfolio.yaml`); keep
 * both in step.
 */
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

/*
 * CloudFront forwards the Lambda function URL as `Host`, so Server Actions'
 * CSRF check (Origin host must equal the app's host) needs the public origin
 * from `SITE_URL` listed explicitly.
 */
const siteOrigin = parseSiteUrl(process.env.SITE_URL);

const nextConfig: NextConfig = {
  // The AWS Lambda package is `.next/standalone`; see docs/architecture/deployment.md.
  output: "standalone",
  poweredByHeader: false,
  experimental: {
    serverActions: {
      allowedOrigins: siteOrigin ? [new URL(siteOrigin).host] : [],
    },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        source: "/admin/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

const withMDX = createMDX();

export default withMDX(nextConfig);
