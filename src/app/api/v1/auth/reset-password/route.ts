import { eq } from "drizzle-orm";
import { db } from "@/db";
import { authCredentials, users } from "@/db/schema";
import { ApiError, clientIp, handler, ok, parseBody, rateLimit } from "@/lib/api";
import { audit } from "@/lib/audit";
import { hashPassword, providerResetPassword } from "@/lib/auth/provider";
import { destroySession } from "@/lib/auth/session";
import { config } from "@/lib/config";
import { normaliseEmail } from "@/lib/domain-matching";
import { resetSchema } from "@/lib/schemas/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/v1/auth/reset-password */
export const POST = handler(async (req: Request) => {
  rateLimit(`auth:${clientIp(req)}`, 5, 60_000);

  const body = await parseBody(req, resetSchema);
  const email = normaliseEmail(body.email);

  const badCode = new ApiError("BAD_REQUEST", "That code is incorrect or has expired.");

  const user = await db.query.users.findFirst({
    where: eq(users.email, email),
    columns: { id: true, deletedAt: true },
  });
  if (!user || user.deletedAt) throw badCode;

  if (config.devAuth) {
    const creds = await db.query.authCredentials.findFirst({
      where: eq(authCredentials.userId, user.id),
    });
    if (!creds?.resetCode || creds.resetCode !== body.code) throw badCode;
    if (creds.resetExpiresAt && creds.resetExpiresAt.getTime() <= Date.now()) throw badCode;

    await db
      .update(authCredentials)
      .set({
        passwordHash: hashPassword(body.newPassword),
        resetCode: null,
        resetExpiresAt: null,
        // A successful reset also clears any lockout.
        failedAttempts: 0,
        lockedUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(authCredentials.userId, user.id));
  } else {
    await providerResetPassword(email, body.code, body.newPassword);
  }

  // Whoever was holding a session on this account may not be the owner.
  await destroySession();

  await audit({
    actorId: user.id,
    action: "user.password_reset",
    entityType: "user",
    entityId: user.id,
    ipAddress: clientIp(req),
  });

  return ok({ message: "Your password has been reset. Sign in with your new password." });
});
