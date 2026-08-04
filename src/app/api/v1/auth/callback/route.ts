import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { notificationPreferences, userStreaks, users } from "@/db/schema";
import { ApiError, clientIp, handler } from "@/lib/api";
import { audit } from "@/lib/audit";
import { exchangeOAuthCode } from "@/lib/auth/provider";
import { createSession } from "@/lib/auth/session";
import { config } from "@/lib/config";
import { domainOf, matchOrganisation, normaliseEmail } from "@/lib/domain-matching";
import { AGE_RANGES } from "@/lib/schemas/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATE_COOKIE = "oauth_state";

/**
 * Google returns no age. The column is NOT NULL with a CHECK constraint, so a
 * placeholder goes in and onboarding collects the real value - which is also
 * where the age gate is applied to federated sign-ups.
 */
const PLACEHOLDER_AGE_RANGE: (typeof AGE_RANGES)[number] = "25-34";

function verifyState(cookieValue: string | undefined, state: string): boolean {
  if (!cookieValue) return false;
  const dot = cookieValue.lastIndexOf(".");
  if (dot <= 0) return false;

  const raw = cookieValue.slice(0, dot);
  const expected = `${raw}.${createHmac("sha256", config.sessionSecret).update(raw).digest("base64url")}`;

  const a = Buffer.from(cookieValue, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;

  return raw === state;
}

/** Derives a spare nickname, e.g. "Ada Lovelace" -> "Ada Lovelace" or "ada-2". */
async function uniqueNickname(seed: string): Promise<string> {
  const base =
    seed
      .replace(/[^\p{L}\p{N} ._'-]/gu, "")
      .trim()
      .slice(0, 28) || "learner";

  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const clash = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.nickname}) = lower(${candidate}) and ${users.deletedAt} is null`)
      .limit(1);
    if (clash.length === 0) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

function redirectTo(path: string): NextResponse {
  const res = NextResponse.redirect(new URL(path, config.appUrl), 302);
  res.cookies.delete(STATE_COOKIE);
  return res;
}

/**
 * GET /api/v1/auth/callback?code=&state=
 *
 * Completes Google sign-in: verify state, exchange the code, upsert the local
 * user, then place them in a cohort only if Google says the address is verified.
 */
export const GET = handler(async (req: Request) => {
  const url = new URL(req.url);

  if (url.searchParams.get("error")) {
    return redirectTo("/login?error=google");
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    throw new ApiError("BAD_REQUEST", "Missing authorization code.");
  }

  const store = await cookies();
  if (!verifyState(store.get(STATE_COOKIE)?.value, state)) {
    throw new ApiError("FORBIDDEN", "Sign-in link expired. Please try again.");
  }

  const identity = await exchangeOAuthCode(code);
  const email = normaliseEmail(identity.email);

  let user = await db.query.users.findFirst({
    where: eq(users.cognitoSub, identity.sub),
  });

  // Fall back to the email address so a password account and a Google account
  // for the same person stay one row. The stored cognitoSub is left alone -
  // it is what existing sessions and the password flow resolve against.
  user ??= await db.query.users.findFirst({ where: eq(users.email, email) });

  const isNew = !user;

  if (!user) {
    const nickname = await uniqueNickname(identity.name ?? email.split("@")[0]!);
    const [created] = await db
      .insert(users)
      .values({
        cognitoSub: identity.sub,
        email,
        emailDomain: domainOf(email),
        emailVerified: identity.emailVerified,
        authProvider: "google",
        nickname,
        ageRange: PLACEHOLDER_AGE_RANGE,
        termsAcceptedAt: new Date(),
      })
      .returning();
    user = created!;
  }

  if (user.deletedAt) {
    return redirectTo("/login?error=account_removed");
  }
  if (user.isSuspended) {
    return redirectTo("/login?error=suspended");
  }

  const newlyVerified = identity.emailVerified && !user.emailVerified;

  if (newlyVerified || (isNew && identity.emailVerified)) {
    const match = await matchOrganisation(email);
    const trialEndsAt =
      user.trialEndsAt ?? new Date(Date.now() + config.limits.trialDays * 24 * 60 * 60 * 1000);

    const [updated] = await db
      .update(users)
      .set({
        emailVerified: true,
        orgId: match.orgId,
        isFoundingMember: match.isFoundingMember,
        trialEndsAt,
        lastActiveAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id))
      .returning();
    user = updated ?? user;

    await db.insert(notificationPreferences).values({ userId: user.id }).onConflictDoNothing();
    await db
      .insert(userStreaks)
      .values({ userId: user.id, timezone: user.timezone })
      .onConflictDoNothing();

    await audit({
      actorId: user.id,
      action: "user.email_verified",
      entityType: "user",
      entityId: user.id,
      metadata: { orgId: match.orgId, matchReason: match.reason, via: "google" },
      ipAddress: clientIp(req),
    });
  } else {
    await db
      .update(users)
      .set({ lastActiveAt: new Date() })
      .where(eq(users.id, user.id));
  }

  await createSession({ sub: user.cognitoSub, email: user.email });

  await audit({
    actorId: user.id,
    action: isNew ? "user.signup" : "user.login",
    entityType: "user",
    entityId: user.id,
    metadata: { authProvider: "google" },
    ipAddress: clientIp(req),
  });

  return redirectTo(user.onboardedAt ? "/feed" : "/onboarding");
});
