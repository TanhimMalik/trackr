import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Don't write agent instruction files (AGENTS.md, CLAUDE.md) during `next dev`.
  agentRules: false,
};

export default nextConfig;
