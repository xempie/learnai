import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Avoid generating apps/web/AGENTS.md and apps/web/CLAUDE.md — the repo's
  // root AGENTS.md is the single source of truth for agent working rules.
  agentRules: false,
};

export default nextConfig;
