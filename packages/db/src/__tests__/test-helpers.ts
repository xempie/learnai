import { execFileSync } from "node:child_process";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const packageRoot = path.resolve(__dirname, "../..");
const require = createRequire(import.meta.url);

export function requireDatabaseUrl(): string | undefined {
  return process.env.DATABASE_URL;
}

/** Run node-pg-migrate's CLI against this package's migrations directory. */
export function runMigrate(direction: "up" | "down"): void {
  const bin = require.resolve("node-pg-migrate/bin/node-pg-migrate.js");
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
