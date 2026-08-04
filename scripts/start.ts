/**
 * Container entrypoint: migrate, seed once, then serve.
 *
 * Migrations run here rather than from an operator's laptop because the
 * database is reachable only from inside the VPC and its password lives in
 * Secrets Manager - nobody needs to hold the credential to ship a schema
 * change.
 *
 * Two instances booting at the same time would otherwise race on the same
 * DDL, so the migration is wrapped in a Postgres advisory lock. The loser
 * waits, then finds the journal already applied and does nothing.
 */

import { spawn } from "node:child_process";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { resolveConnectionString } from "../src/db/connection-string";

/**
 * Any 64-bit constant works; it just has to be the same in every instance.
 * Kept below Number.MAX_SAFE_INTEGER so it survives the round trip as a plain
 * number - postgres.js binds it to the int8 parameter unchanged.
 */
const MIGRATION_LOCK_KEY = 8147233901552244;

function log(message: string): void {
  console.log(`[boot] ${message}`);
}

/**
 * Resets one account's password from `ADMIN_PASSWORD_RESET`, then does nothing
 * on later boots unless the value changes.
 *
 * This exists because the database is only reachable from inside the VPC, so
 * there is no psql session to fix a lost admin login from. Set the variable on
 * the App Runner service, deploy, and remove it again.
 *
 * The account must already exist and already have a password row - this can
 * change a credential, never mint one, so it cannot be used to grant access to
 * an address that was never provisioned.
 */
async function resetAdminPassword(sql: postgres.Sql): Promise<void> {
  const password = process.env.ADMIN_PASSWORD_RESET;
  if (!password) return;

  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@data-corner.com.au";
  if (password.length < 10) {
    throw new Error("ADMIN_PASSWORD_RESET must be at least 10 characters.");
  }

  const { hashPassword } = await import("../src/lib/auth/password");
  const rows = await sql<{ id: string }[]>`
    update auth_credentials c
       set password_hash = ${hashPassword(password)},
           failed_attempts = 0,
           locked_until = null,
           updated_at = now()
      from users u
     where u.id = c.user_id
       and lower(u.email) = ${email.toLowerCase()}
    returning u.id
  `;

  if (rows.length === 0) {
    // Loud, but not fatal: a typo in the email should not take the site down.
    console.error(`[boot] ADMIN_PASSWORD_RESET set, but no credential row for ${email}`);
    return;
  }
  log(`password reset for ${email} - now clear ADMIN_PASSWORD_RESET`);
}

function run(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", env });
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)),
    );
    child.on("error", reject);
  });
}

async function migrateAndSeed(url: string): Promise<void> {
  // max: 1 - an advisory lock is held on a session, so every statement below
  // must travel down the same connection.
  const sql = postgres(url, { max: 1, connect_timeout: 30, prepare: false });

  try {
    log("acquiring migration lock");
    await sql`select pg_advisory_lock(${MIGRATION_LOCK_KEY})`;

    log("applying migrations");
    await migrate(drizzle(sql), { migrationsFolder: "./src/db/migrations" });
    log("migrations up to date");

    // Seed only an empty database. A restart must never duplicate content or
    // resurrect rows an admin deleted on purpose.
    const rows = await sql<{ count: number }[]>`select count(*)::int as count from topics`;
    const count = rows[0]?.count ?? 0;
    if (count === 0) {
      log("no topics found - seeding starter content");
      await run("node", ["node_modules/tsx/dist/cli.mjs", "src/db/seed.ts"], {
        ...process.env,
        DATABASE_URL: url,
      });
      log("seed complete");
    } else {
      log(`${count} topics already present - skipping seed`);
    }

    await resetAdminPassword(sql);
  } finally {
    // Release before closing so a crash mid-migration cannot wedge the lock
    // for the next boot.
    await sql`select pg_advisory_unlock(${MIGRATION_LOCK_KEY})`.catch(() => {});
    await sql.end({ timeout: 5 });
  }
}

/**
 * Wrapped in a function rather than run at the top level: tsx compiles this
 * file to CommonJS, which has no top-level await. It also gives the boot a
 * single failure path - anything thrown here exits non-zero, so App Runner
 * reports a failed deployment instead of a container that is up but useless.
 */
async function main(): Promise<void> {
  const url = resolveConnectionString(process.env);
  await migrateAndSeed(url);

  // The app reads DATABASE_URL directly; hand it the resolved string so it
  // does not have to re-derive it from the secret.
  log("starting Next.js");
  await run(
    "node",
    ["node_modules/next/dist/bin/next", "start", "-p", process.env.PORT ?? "3000"],
    { ...process.env, DATABASE_URL: url },
  );
}

main().catch((error: unknown) => {
  console.error("[boot] failed:", error);
  process.exit(1);
});
