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
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      reportsDirectory: "./coverage",
    },
  },
});
