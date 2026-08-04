import { eq } from "drizzle-orm";
import { db } from "@/db";
import { authCredentials, users } from "@/db/schema";
import { ApiError, clientIp, handler, ok, parseBody, rateLimit } from "@/lib/api";
import { audit } from "@/lib/audit";
import { providerSignIn, verifyPassword } from "@/lib/auth/provider";
import { createSession } from "@/lib/auth/session";
import { config } from "@/lib/config";
import { normaliseEmail } from "@/lib/domain-matching";
import { loginSchema } from "@/lib/schemas/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Dev-auth lockout: 10 failures buys a 15-minute cool-off. */
const MAX_FAILED_ATTEMPTS = 10;
const LOCKOUT_MS = 15 * 60 * 1000;

/** POST /api/v1/auth/login */
export const POST = handler(async (req: Request) => {
  rateLimit(`auth:${clientIp(req)}`, 5, 60_000);

  const body = await parseBody(req, loginSchema);
  const email = normaliseEmail(body.email);

  // One message for every credential failure - never confirm an address exists.
  const invalid = new ApiError("UNAUTHENTICATED", "Incorrect email or password.");

  const user = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (!user || user.deletedAt) throw invalid;

  if (config.devAuth) {
    const creds = await db.query.authCredentials.findFirst({
      where: eq(authCredentials.userId, user.id),
    });
    if (!creds) throw invalid;

    if (creds.lockedUntil && creds.lockedUntil.getTime() > Date.now()) {
      const minutes = Math.max(1, Math.ceil((creds.lockedUntil.getTime() - Date.now()) / 60_000));
      throw new ApiError(
        "FORBIDDEN",
        `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
      );
    }

    if (!verifyPassword(body.password, creds.passwordHash)) {
      const failed = creds.failedAttempts + 1;
      const lock = failed >= MAX_FAILED_ATTEMPTS;
      await db
        .update(authCredentials)
        .set({
          // Reset the counter when locking so one post-lockout slip doesn't
          // immediately re-lock the account.
          failedAttempts: lock ? 0 : failed,
          lockedUntil: lock ? new Date(Date.now() + LOCKOUT_MS) : null,
          updatedAt: new Date(),
        })
        .where(eq(authCredentials.userId, user.id));

      if (lock) {
        await audit({
          actorId: user.id,
          action: "user.login_locked",
          entityType: "user",
          entityId: user.id,
          ipAddress: clientIp(req),
        });
      }
      throw invalid;
    }

    if (creds.failedAttempts !== 0 || creds.lockedUntil) {
      await db
        .update(authCredentials)
        .set({ failedAttempts: 0, lockedUntil: null, updatedAt: new Date() })
        .where(eq(authCredentials.userId, user.id));
    }
  } else {
    await providerSignIn(email, body.password);
  }

  if (!user.emailVerified) {
    throw new ApiError("FORBIDDEN", "Verify your email address before signing in.");
  }
  if (user.isSuspended) {
    throw new ApiError("FORBIDDEN", "This account is suspended.");
  }

  await createSession({ sub: user.cognitoSub, email: user.email });

  await db
    .update(users)
    .set({ lastActiveAt: new Date() })
    .where(eq(users.id, user.id));

  await audit({
    actorId: user.id,
    action: "user.login",
    entityType: "user",
    entityId: user.id,
    metadata: { authProvider: user.authProvider },
    ipAddress: clientIp(req),
  });

  return ok({
    user: {
      id: user.id,
      email: user.email,
      nickname: user.nickname,
      avatar_key: user.avatarKey,
      role: user.role,
      onboarded: Boolean(user.onboardedAt),
      org_id: user.orgId,
      is_visible: user.orgVisible,
      is_founding_member: user.isFoundingMember,
    },
  });
});
