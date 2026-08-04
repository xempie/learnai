import { createHmac, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { clientIp, handler, rateLimit } from "@/lib/api";
import { googleLoginUrl } from "@/lib/auth/provider";
import { config } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATE_COOKIE = "oauth_state";
const STATE_TTL_SEC = 10 * 60;

/**
 * GET /api/v1/auth/google
 *
 * Starts the Hosted UI flow. The `state` value is echoed back by Cognito and
 * compared against a signed, http-only cookie in the callback - without that
 * pairing an attacker can complete the flow on the victim's behalf (login CSRF).
 * Signing the cookie stops a client that can set cookies from minting its own.
 */
export const GET = handler(async (req: Request) => {
  rateLimit(`auth:${clientIp(req)}`, 5, 60_000);

  const state = randomBytes(24).toString("base64url");
  const mac = createHmac("sha256", config.sessionSecret).update(state).digest("base64url");

  // Throws NOT_CONFIGURED (501) when Cognito's hosted domain is absent, which
  // the handler turns into a JSON error rather than a broken redirect.
  const url = googleLoginUrl(state);

  const res = NextResponse.redirect(url, 302);
  res.cookies.set(STATE_COOKIE, `${state}.${mac}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: STATE_TTL_SEC,
  });
  return res;
});
