import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Avoid generating apps/web/AGENTS.md and apps/web/CLAUDE.md — the repo's
  // root AGENTS.md is the single source of truth for agent working rules.
  agentRules: false,
  // @learn-ai/db (T02) ships its TypeScript source directly (no build step,
  // "main": "src/index.ts") and its internal relative imports use the
  // TS-idiomatic `./client.js` specifier (resolves to `client.ts` — valid
  // under its own `moduleResolution: "bundler"`). Next's bundler needs this
  // workspace package explicitly listed here to apply the same resolution
  // and run it through Next's own TS transform, or it fails to resolve
  // those specifiers as an untranspiled dependency. T03 is the first task
  // to import @learn-ai/db from apps/web, which is why this wasn't needed
  // until now.
  transpilePackages: ["@learn-ai/db"],
};

export default nextConfig;
