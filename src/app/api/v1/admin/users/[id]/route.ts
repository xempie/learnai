import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { ApiError, clientIp, handler, ok, parseBody } from "@/lib/api";
import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth/session";
import { providerResendCode } from "@/lib/auth/provider";
import { adminUserActionSchema } from "@/lib/schemas/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/v1/admin/users/[id]
 *   { action: 'suspend' | 'unsuspend' | 'resend_verification' }
 *
 * The role is NOT patchable here. Privilege escalation is a separate, deliberate
 * operation - an account-admin screen must never be able to mint an admin.
 */
export const PATCH = handler(async (req: Request, ctx: Ctx) => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const { action, reason } = await parseBody(req, adminUserActionSchema);

  const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!target || target.deletedAt) throw new ApiError("NOT_FOUND", "User not found.");

  if (action === "resend_verification") {
    if (target.emailVerified) {
      throw new ApiError("CONFLICT", "That email is already verified.");
    }
    await providerResendCode(target.email);

    await audit({
      actorId: admin.id,
      action: "admin.user_verification_resent",
      entityType: "user",
      entityId: id,
      ipAddress: clientIp(req),
    });

    return ok({ user: { id, email_verified: false }, resent: true });
  }

  const suspend = action === "suspend";
  if (suspend && target.id === admin.id) {
    throw new ApiError("BAD_REQUEST", "You can't suspend your own account.");
  }
  if (target.isSuspended === suspend) {
    return ok({ user: { id, is_suspended: suspend }, changed: false });
  }

  await db
    .update(users)
    .set({ isSuspended: suspend, updatedAt: new Date() })
    .where(eq(users.id, id));

  await audit({
    actorId: admin.id,
    action: suspend ? "admin.user_suspended" : "admin.user_unsuspended",
    entityType: "user",
    entityId: id,
    // Never log the email address itself (TECHNICAL_SPEC §9.2).
    metadata: { reason: reason ?? null, role: target.role },
    ipAddress: clientIp(req),
  });

  return ok({ user: { id, is_suspended: suspend }, changed: true });
});
