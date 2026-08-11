import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const packageRoot = path.resolve(__dirname, "../..");

export function requireDatabaseUrl(): string | undefined {
  return process.env.DATABASE_URL;
}

/** Run node-pg-migrate's CLI against this package's migrations directory. */
export function runMigrate(direction: "up" | "down"): void {
  // require.resolve can't reach the bin: node-pg-migrate's "exports" map does
  // not expose ./bin/*, so resolution fails (as ".js.js") on every platform.
  // pnpm symlinks the package into this workspace's node_modules, so the
  // direct path is stable locally and in CI.
  const bin = path.join(
    packageRoot,
    "node_modules",
    "node-pg-migrate",
    "bin",
    "node-pg-migrate.js",
  );
  execFileSync(
    process.execPath,
    [bin, direction, "--migrations-dir", path.join(packageRoot, "migrations")],
    {
      cwd: packageRoot,
      stdio: "pipe",
      env: process.env,
    },
  );
}
