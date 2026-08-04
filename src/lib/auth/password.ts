import { pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Local password hashing, used only when Cognito is not configured (dev mode)
 * and by the seed script. Deliberately free of `server-only` so CLI scripts
 * (`pnpm db:seed`) can import it outside the Next.js runtime.
 */

const PBKDF2_ITERATIONS = 210_000;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, 32, "sha256");
  return `pbkdf2$${PBKDF2_ITERATIONS}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = Number(parts[1]);
  if (!Number.isFinite(iterations) || iterations < 1) return false;
  const salt = Buffer.from(parts[2]!, "base64");
  const expected = Buffer.from(parts[3]!, "base64");
  const actual = pbkdf2Sync(password, salt, iterations, expected.length, "sha256");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Six-digit numeric code for email verification / password reset. */
export function generateCode(): string {
  return String(randomBytes(4).readUInt32BE(0) % 1_000_000).padStart(6, "0");
}
