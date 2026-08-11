import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      // Mirrors apps/web/tsconfig.json's "@/*" -> "./src/*" path mapping so
      // vitest (run from the repo root, not through Next's bundler) can
      // resolve the same imports Next.js resolves at build/dev time.
      "@": path.resolve(__dirname, "apps/web/src"),
    },
  },
  test: {
    environment: "node",
    include: ["apps/*/src/**/*.{test,spec}.{ts,tsx}", "packages/*/src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/.next/**", "**/dist/**"],
    // DB-backed test files (packages/db's migration-cycle test, T03's auth
    // integration test, and any future ones) all share ONE live Postgres
    // instance via DATABASE_URL. Vitest's default file parallelism runs
    // separate test files concurrently in different workers, which races
    // packages/db's migrate down/up cycle against any other file's queries
    // — e.g. a signup INSERT landing in the brief window where migrate-
    // and-constraints.test.ts has torn tables down but not yet rebuilt
    // them. Sequential file execution avoids that; the suite is small
    // enough that this costs negligible wall-clock time.
    fileParallelism: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      reportsDirectory: "./coverage",
    },
  },
});
