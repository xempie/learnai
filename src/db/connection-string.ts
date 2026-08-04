/**
 * Resolves the Postgres connection string.
 *
 * Two supported shapes:
 *
 *  - `DATABASE_URL` - a complete URL. Used in local dev and anywhere the
 *    operator holds the credential themselves.
 *
 *  - `DATABASE_SECRET` + `DATABASE_HOST`/`_PORT`/`_NAME` - the secret is the
 *    raw JSON blob RDS writes to Secrets Manager when the instance is created
 *    with a managed master password. App Runner injects it at runtime, so the
 *    password never appears in a task definition, a config file, or a shell
 *    history. Rotating it in Secrets Manager is picked up on the next boot.
 *
 * No `server-only` guard here: the migration entrypoint runs this outside the
 * Next.js runtime.
 */

/**
 * Extends the index signature so `process.env` is directly assignable without
 * a cast at every call site.
 */
export interface Env extends Record<string, string | undefined> {
  DATABASE_URL?: string;
  DATABASE_SECRET?: string;
  DATABASE_HOST?: string;
  DATABASE_PORT?: string;
  DATABASE_NAME?: string;
}

/** Percent-encodes a credential for safe inclusion in a URL's userinfo. */
function enc(value: string): string {
  return encodeURIComponent(value);
}

export function resolveConnectionString(env: Env): string {
  if (env.DATABASE_URL) return env.DATABASE_URL;

  if (env.DATABASE_SECRET) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(env.DATABASE_SECRET);
    } catch {
      throw new Error("DATABASE_SECRET is not valid JSON.");
    }
    const secret = parsed as { username?: string; password?: string };
    if (!secret.username || !secret.password) {
      throw new Error("DATABASE_SECRET must contain 'username' and 'password'.");
    }

    const host = env.DATABASE_HOST;
    if (!host) throw new Error("DATABASE_HOST is required alongside DATABASE_SECRET.");
    const port = env.DATABASE_PORT ?? "5432";
    const name = env.DATABASE_NAME ?? "acadu";

    // sslmode=require: RDS terminates TLS with an Amazon-issued certificate.
    return `postgres://${enc(secret.username)}:${enc(secret.password)}@${host}:${port}/${name}?sslmode=require`;
  }

  throw new Error(
    "No database configuration. Set DATABASE_URL, or DATABASE_SECRET with DATABASE_HOST (see README).",
  );
}
