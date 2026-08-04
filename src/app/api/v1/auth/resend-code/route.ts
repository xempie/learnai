import { eq } from "drizzle-orm";
import { db } from "@/db";
import { authCredentials, users } from "@/db/schema";
import { clientIp, handler, ok, parseBody, rateLimit } from "@/lib/api";
import { generateCode, providerResendCode } from "@/lib/auth/provider";
import { config } from "@/lib/config";
import { normaliseEmail } from "@/lib/domain-matching";
import { resendCodeSchema } from "@/lib/schemas/auth";
import { sendVerificationEmail } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VERIFICATION_TTL_MS = 15 * 60 * 1000;

const SAME_ANSWER = {
  message: "If that address needs verifying, we've sent a new code.",
} as const;

/**
 * POST /api/v1/auth/resend-code
 *
 * Always 200, whatever the address. The response must not tell an attacker
 * which addresses are registered or already verified.
 */
export const POST = handler(async (req: Request) => {
  rateLimit(`auth:${clientIp(req)}`, 5, 60_000);

  const body = await parseBody(req, resendCodeSchema);
  const email = normaliseEmail(body.email);

  const user = await db.query.users.findFirst({
    where: eq(users.email, email),
    columns: { id: true, emailVerified: true, deletedAt: true },
  });

  if (!user || user.deletedAt || user.emailVerified) return ok(SAME_ANSWER);

  if (config.devAuth) {
    const code = generateCode();
    await db
      .insert(authCredentials)
      .values({
        userId: user.id,
        // Placeholder only reached if the credential row is missing entirely
        // (e.g. a federated account); the user must reset to sign in with it.
        passwordHash: "pbkdf2$0$$",
        verificationCode: code,
        verificationExpiresAt: new Date(Date.now() + VERIFICATION_TTL_MS),
      })
      .onConflictDoUpdate({
        target: authCredentials.userId,
        set: {
          verificationCode: code,
          verificationExpiresAt: new Date(Date.now() + VERIFICATION_TTL_MS),
          updatedAt: new Date(),
        },
      });
    await sendVerificationEmail(email, code);
    if (process.env.NODE_ENV !== "production") {
      console.info("[dev] verification code for", email, code);
    }
    return ok(SAME_ANSWER);
  }

  try {
    await providerResendCode(email);
  } catch (err) {
    // Swallow provider-side detail so the response stays identical.
    console.error("[auth] resend-code failed", err);
  }

  return ok(SAME_ANSWER);
});
