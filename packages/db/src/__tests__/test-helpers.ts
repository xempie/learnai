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
  const args = [bin, direction, "--migrations-dir", path.join(packageRoot, "migrations")];
  if (direction === "down") {
    // node-pg-migrate's `down` rolls back only ONE migration by default.
    // This helper's callers all want a full teardown ("start from a clean
    // slate" / "drops everything cleanly") regardless of how many
    // migration files exist — pass an explicit count comfortably above
    // any realistic number of migrations. (This bit locally when this
    // repo had only one migration file; T03 added a second and exposed it
    // — a bare `down` was silently leaving the first migration applied.)
    args.push("1000");
  }
  execFileSync(process.execPath, args, {
    cwd: packageRoot,
    stdio: "pipe",
    env: process.env,
  });
}
