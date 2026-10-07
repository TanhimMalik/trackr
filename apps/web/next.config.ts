import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages are published as TypeScript source.
  transpilePackages: ["@trackr/domain"],
  // Don't write agent instruction files (AGENTS.md, CLAUDE.md) during `next dev`.
  agentRules: false,
};

export default nextConfig;
