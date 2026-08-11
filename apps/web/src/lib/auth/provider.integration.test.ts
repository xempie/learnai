import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getPool, newId } from "@learn-ai/db";
import { encode } from "next-auth/jwt";
import { authProvider, verifyEmailToken } from "./provider";

// DB-backed tests. Skipped — not failed — when DATABASE_URL is unset, per
// the T02 skip-when-no-DATABASE_URL pattern (packages/db/src/__tests__).
// Locally there is no Postgres on this machine; CI's postgres:16 service
// (migrated up before the test step, see .github/workflows/ci.yml) runs
// these for real.
const databaseUrl = process.env.DATABASE_URL;

// Matches @auth/core/jwt's defaultCookies().sessionToken.name for a
// non-secure (http) deployment — see lib/auth/auth.ts (session strategy:
// "jwt") and node_modules/@auth/core/lib/utils/cookie.js.
const SESSION_COOKIE_NAME = "authjs.session-token";

async function sessionRequestFor(userId: string): Promise<NextRequest> {
  const token = await encode({
    secret: process.env.AUTH_SECRET ?? "integration-test-secret",
    salt: SESSION_COOKIE_NAME,
    token: { sub: userId },
  });
  return new NextRequest("http://localhost:3000/api/v1/me", {
    headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
  });
}

describe.skipIf(!databaseUrl)("AuthProvider — DB-backed behaviour (§12 T03 acceptance)", () => {
  beforeAll(() => {
    process.env.AUTH_SECRET ??= "integration-test-secret";
  });

  afterAll(async () => {
    await getPool().end();
  });

  it("signUp creates a users row: member role, free tier, individual cohort track, unverified", async () => {
    const email = `t03-signup-${newId()}@example.test`;
    const { userId } = await authProvider.signUp(email, "correct horse battery staple");

    const { rows } = await getPool().query<{
      email: string;
      role: string;
      tier: string;
      cohort_track: string;
      email_verified_at: string | null;
    }>(`SELECT email, role, tier, cohort_track, email_verified_at FROM users WHERE id = $1`, [
      userId,
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      email,
      role: "member",
      tier: "free",
      cohort_track: "individual", // T05 wires real cohort classification
      email_verified_at: null,
    });

    const { rows: credRows } = await getPool().query<{ password_hash: string }>(
      `SELECT password_hash FROM auth_credentials WHERE user_id = $1`,
      [userId],
    );
    expect(credRows).toHaveLength(1);
    expect(credRows[0]?.password_hash).not.toBe("correct horse battery staple");
  });

  it("verify flips users.email_verified_at", async () => {
    const email = `t03-verify-${newId()}@example.test`;
    const { userId } = await authProvider.signUp(email, "correct horse battery staple");

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await authProvider.sendVerification(userId);
    const logged = logSpy.mock.calls.map((call) => String(call[0])).join("\n");
    logSpy.mockRestore();

    const token = logged.match(/token=([a-f0-9]+)/)?.[1];
    expect(token, "sendVerification should log a verify URL containing a token").toBeTruthy();

    const before = await getPool().query<{ email_verified_at: string | null }>(
      `SELECT email_verified_at FROM users WHERE id = $1`,
      [userId],
    );
    expect(before.rows[0]?.email_verified_at).toBeNull();

    const result = await verifyEmailToken(token as string);
    expect(result.userId).toBe(userId);

    const after = await getPool().query<{ email_verified_at: string | null }>(
      `SELECT email_verified_at FROM users WHERE id = $1`,
      [userId],
    );
    expect(after.rows[0]?.email_verified_at).not.toBeNull();

    // Single-use: the same token cannot be replayed.
    await expect(verifyEmailToken(token as string)).rejects.toMatchObject({
      status: 422,
      code: "INVALID_TOKEN",
    });
  });

  it("unverified users are blocked from /me (requireUser throws 401 EMAIL_NOT_VERIFIED)", async () => {
    const email = `t03-unverified-${newId()}@example.test`;
    const { userId } = await authProvider.signUp(email, "correct horse battery staple");
    const req = await sessionRequestFor(userId);

    await expect(authProvider.requireUser(req)).rejects.toMatchObject({
      status: 401,
      code: "EMAIL_NOT_VERIFIED",
    });
  });

  it("a verified member can reach requireUser (the guard GET /me relies on)", async () => {
    const email = `t03-verified-${newId()}@example.test`;
    const { userId } = await authProvider.signUp(email, "correct horse battery staple");
    await getPool().query(`UPDATE users SET email_verified_at = now() WHERE id = $1`, [userId]);

    const req = await sessionRequestFor(userId);
    await expect(authProvider.requireUser(req)).resolves.toMatchObject({
      id: userId,
      email,
      emailVerified: true,
      role: "member",
    });
  });

  it("requireRole returns 403 for a verified member hitting a reviewer-only route", async () => {
    const email = `t03-member-${newId()}@example.test`;
    const { userId } = await authProvider.signUp(email, "correct horse battery staple");
    await getPool().query(`UPDATE users SET email_verified_at = now() WHERE id = $1`, [userId]);

    const req = await sessionRequestFor(userId);
    await expect(authProvider.requireRole(req, "reviewer")).rejects.toMatchObject({
      status: 403,
      code: "FORBIDDEN",
    });
  });

  it("requireRole resolves for a verified reviewer hitting a reviewer-only route", async () => {
    const email = `t03-reviewer-${newId()}@example.test`;
    const { userId } = await authProvider.signUp(email, "correct horse battery staple");
    await getPool().query(
      `UPDATE users SET email_verified_at = now(), role = 'reviewer' WHERE id = $1`,
      [userId],
    );

    const req = await sessionRequestFor(userId);
    await expect(authProvider.requireRole(req, "reviewer")).resolves.toMatchObject({
      role: "reviewer",
    });
  });
});
