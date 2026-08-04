import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { authCredentials, users } from "@/db/schema";
import { ApiError, clientIp, handler, ok, parseBody, rateLimit } from "@/lib/api";
import { audit } from "@/lib/audit";
import { generateCode, hashPassword, providerSignUp } from "@/lib/auth/provider";
import { config } from "@/lib/config";
import { domainOf, normaliseEmail } from "@/lib/domain-matching";
import { assertAllowedAgeRange, signupSchema } from "@/lib/schemas/auth";
import { sendVerificationEmail } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VERIFICATION_TTL_MS = 15 * 60 * 1000;

/**
 * POST /api/v1/auth/signup
 *
 * Creates the identity-provider user and the local `users` row, then stops.
 * Domain matching deliberately does NOT run here - an unverified address must
 * never place someone inside an organisation's cohort (TECHNICAL_SPEC §7.1).
 */
export const POST = handler(async (req: Request) => {
  rateLimit(`auth:${clientIp(req)}`, 5, 60_000);

  const body = await parseBody(req, signupSchema);

  // Age gate: enforced, not recorded.
  const ageRange = assertAllowedAgeRange(body.ageRange);

  const email = normaliseEmail(body.email);
  const emailDomain = domainOf(email);
  const nickname = body.nickname.trim();

  const existingEmail = await db.query.users.findFirst({
    where: eq(users.email, email),
    columns: { id: true },
  });
  if (existingEmail) {
    throw new ApiError("CONFLICT", "An account with that email already exists.");
  }

  // No organisation exists yet, so nickname uniqueness is checked platform-wide
  // here. Once a user has a cohort, PATCH /me scopes it to the organisation.
  const existingNickname = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.nickname}) = lower(${nickname}) and ${users.deletedAt} is null`)
    .limit(1);
  if (existingNickname.length > 0) {
    throw new ApiError("CONFLICT", "That nickname is taken. Try another.");
  }

  const signUp = await providerSignUp(email, body.password);

  let userId: string;
  try {
    const [row] = await db
      .insert(users)
      .values({
        cognitoSub: signUp.sub,
        email,
        emailDomain,
        emailVerified: false,
        authProvider: "email",
        nickname,
        ageRange,
        // Explicit consent, captured at the moment it was given.
        termsAcceptedAt: new Date(),
      })
      .returning({ id: users.id });
    userId = row!.id;
  } catch (err) {
    // Lost a race against a concurrent signup with the same email/nickname.
    if (typeof err === "object" && err !== null && (err as { code?: string }).code === "23505") {
      throw new ApiError("CONFLICT", "An account with that email already exists.");
    }
    throw err;
  }

  if (config.devAuth) {
    // No Cognito configured: own the credential locally so the flow is testable.
    const code = generateCode();
    await db.insert(authCredentials).values({
      userId,
      passwordHash: hashPassword(body.password),
      verificationCode: code,
      verificationExpiresAt: new Date(Date.now() + VERIFICATION_TTL_MS),
    });
    await sendVerificationEmail(email, code);
    if (process.env.NODE_ENV !== "production") {
      console.info("[dev] verification code for", email, code);
    }
  }

  await audit({
    actorId: userId,
    action: "user.signup",
    entityType: "user",
    entityId: userId,
    metadata: { authProvider: "email", ageRange },
    ipAddress: clientIp(req),
  });

  return ok({ needs_verification: true, email }, 201);
});
