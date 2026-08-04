import { eq } from "drizzle-orm";
import { db } from "@/db";
import { authCredentials, users } from "@/db/schema";
import { clientIp, handler, ok, parseBody, rateLimit } from "@/lib/api";
import { audit } from "@/lib/audit";
import { generateCode, providerForgotPassword } from "@/lib/auth/provider";
import { config } from "@/lib/config";
import { normaliseEmail } from "@/lib/domain-matching";
import { forgotSchema } from "@/lib/schemas/auth";
import { sendPasswordResetEmail } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RESET_TTL_MS = 15 * 60 * 1000;

/**
 * The response is byte-identical whether or not the account exists. Any
 * variation - message, status, timing branch - is a user-enumeration oracle.
 */
const SAME_ANSWER = {
  message: "If an account exists for that address, we've sent a reset code.",
} as const;

/** POST /api/v1/auth/forgot-password */
export const POST = handler(async (req: Request) => {
  rateLimit(`auth:${clientIp(req)}`, 5, 60_000);

  const body = await parseBody(req, forgotSchema);
  const email = normaliseEmail(body.email);

  const user = await db.query.users.findFirst({
    where: eq(users.email, email),
    columns: { id: true, deletedAt: true },
  });

  if (!user || user.deletedAt) return ok(SAME_ANSWER);

  if (config.devAuth) {
    const code = generateCode();
    const expiresAt = new Date(Date.now() + RESET_TTL_MS);
    await db
      .insert(authCredentials)
      .values({
        userId: user.id,
        // Unusable hash: a federated account with no local password can still
        // request a reset, and the reset itself writes a real hash.
        passwordHash: "pbkdf2$0$$",
        resetCode: code,
        resetExpiresAt: expiresAt,
      })
      .onConflictDoUpdate({
        target: authCredentials.userId,
        set: { resetCode: code, resetExpiresAt: expiresAt, updatedAt: new Date() },
      });
    await sendPasswordResetEmail(email, code);
    if (process.env.NODE_ENV !== "production") {
      console.info("[dev] password reset code for", email, code);
    }
  } else {
    try {
      await providerForgotPassword(email);
    } catch (err) {
      console.error("[auth] forgot-password failed", err);
    }
  }

  await audit({
    actorId: user.id,
    action: "user.password_reset_requested",
    entityType: "user",
    entityId: user.id,
    ipAddress: clientIp(req),
  });

  return ok(SAME_ANSWER);
});
