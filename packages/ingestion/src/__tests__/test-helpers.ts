import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Deliberate small duplication of packages/db/src/__tests__/test-helpers.ts
// rather than a cross-package deep import of another package's __tests__
// internals (not part of @learn-ai/db's public index.ts, and reaching into
// a sibling package's src/__tests__ from outside its own rootDir is the
// kind of thing that quietly breaks under stricter tsconfig rootDir
// settings later). Migrations live in packages/db/migrations — this
// package has none of its own — so dbPackageRoot points there, not at
// this package's own root.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPackageRoot = path.resolve(__dirname, "../../../db");

export function requireDatabaseUrl(): string | undefined {
  return process.env.DATABASE_URL;
}

/** Run node-pg-migrate's CLI against packages/db's migrations directory. */
export function runMigrate(direction: "up" | "down"): void {
  const bin = path.join(
    dbPackageRoot,
    "node_modules",
    "node-pg-migrate",
    "bin",
    "node-pg-migrate.js",
  );
  const args = [bin, direction, "--migrations-dir", path.join(dbPackageRoot, "migrations")];
  if (direction === "down") {
    args.push("1000");
  }
  execFileSync(process.execPath, args, {
    cwd: dbPackageRoot,
    stdio: "pipe",
    env: process.env,
  });
}
