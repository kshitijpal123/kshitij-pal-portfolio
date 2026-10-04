import createMDX from "@next/mdx";
import type { NextConfig } from "next";

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

const nextConfig: NextConfig = {
  // The AWS Lambda package is `.next/standalone`; see docs/architecture/deployment.md.
  output: "standalone",
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

const withMDX = createMDX();

export default withMDX(nextConfig);
