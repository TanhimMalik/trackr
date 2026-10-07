import type { NextConfig } from "next";

// Applied to every response. A full script CSP needs per-request nonces, so
// this policy covers framing, plugins, base URLs and form targets.
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value:
      "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
];

const nextConfig: NextConfig = {
  // Workspace packages are published as TypeScript source.
  transpilePackages: ["@trackr/domain"],
  // Don't write agent instruction files (AGENTS.md, CLAUDE.md) during `next dev`.
  agentRules: false,
  poweredByHeader: false,
  headers: async () => [{ source: "/:path*", headers: securityHeaders }],
};

export default nextConfig;
