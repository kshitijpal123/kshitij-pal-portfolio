import createMDX from "@next/mdx";
import type { NextConfig } from "next";

/*
 * Only headers that cannot affect rendering. A Content Security Policy is
 * deliberately absent: the inline theme script and JSON-LD need hashes or
 * nonces, which belong with the production hosting setup.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

const withMDX = createMDX();

export default withMDX(nextConfig);
