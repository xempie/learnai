import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { couponRedemptions, coupons } from "@/db/schema";
import { ApiError, clientIp, handler, ok, parseBody } from "@/lib/api";
import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth/session";
import { serialiseCoupon } from "@/lib/coupons";
import { couponUpdateSchema } from "@/lib/schemas/billing";
import { getStripe, isStripeEnabled } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ id: string }>;
}

async function loadCoupon(id: string) {
  const [row] = await db.select().from(coupons).where(eq(coupons.id, id)).limit(1);
  if (!row) throw new ApiError("NOT_FOUND", "Coupon not found.");
  return row;
}

async function redemptionCount(couponId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(couponRedemptions)
    .where(eq(couponRedemptions.couponId, couponId));
  return Number(row?.count ?? 0);
}

/** PATCH /api/v1/admin/coupons/[id] - activation, expiry and limits only. */
export const PATCH = handler(async (req: Request, ctx: Ctx) => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const existing = await loadCoupon(id);
  const input = await parseBody(req, couponUpdateSchema);

  // The discount type and value are immutable: changing them under codes people
  // already hold changes the price they were promised.
  const patch: Partial<typeof coupons.$inferInsert> = { updatedAt: new Date() };
  if (input.description !== undefined) patch.description = input.description ?? null;
  if (input.isActive !== undefined) patch.isActive = input.isActive;
  if (input.maxRedemptions !== undefined) patch.maxRedemptions = input.maxRedemptions ?? null;
  if (input.perUserLimit !== undefined) patch.perUserLimit = input.perUserLimit;
  if (input.startsAt !== undefined) patch.startsAt = input.startsAt ?? null;
  if (input.expiresAt !== undefined) patch.expiresAt = input.expiresAt ?? null;

  if (
    patch.maxRedemptions !== undefined &&
    patch.maxRedemptions !== null &&
    patch.maxRedemptions < existing.redemptionCount
  ) {
    throw new ApiError(
      "VALIDATION_FAILED",
      `This code has already been redeemed ${existing.redemptionCount} times.`,
    );
  }

  const [updated] = await db
    .update(coupons)
    .set(patch)
    .where(eq(coupons.id, id))
    .returning();
  if (!updated) throw new ApiError("NOT_FOUND", "Coupon not found.");

  await syncPromotionCodeState(updated.stripePromotionCodeId, updated.isActive);

  await audit({
    actorId: admin.id,
    action: "admin.coupon_updated",
    entityType: "coupon",
    entityId: id,
    metadata: { fields: Object.keys(patch).filter((k) => k !== "updatedAt") },
    ipAddress: clientIp(req),
  });

  return ok({ coupon: serialiseCoupon(updated, { redemptionCount: await redemptionCount(id) }) });
});

/**
 * DELETE /api/v1/admin/coupons/[id]
 *
 * Deactivates. A coupon with redemptions is never hard-deleted - the redemption
 * rows are the audit trail for money that was discounted, and orphaning them
 * would make the books unreconcilable.
 */
export const DELETE = handler(async (req: Request, ctx: Ctx) => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const existing = await loadCoupon(id);
  const redemptions = await redemptionCount(id);

  const [updated] = await db
    .update(coupons)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(coupons.id, id))
    .returning();

  await syncPromotionCodeState(existing.stripePromotionCodeId, false);

  await audit({
    actorId: admin.id,
    action: "admin.coupon_deactivated",
    entityType: "coupon",
    entityId: id,
    metadata: { code: existing.code, redemption_count: redemptions },
    ipAddress: clientIp(req),
  });

  return ok({
    coupon: serialiseCoupon(updated ?? existing, { redemptionCount: redemptions }),
    deactivated: true,
    hard_deleted: false,
    message:
      redemptions > 0
        ? "Deactivated. Coupons with redemptions are kept for the billing record."
        : "Deactivated.",
  });
});

/** Mirror activation state onto the Stripe promotion code, best effort. */
async function syncPromotionCodeState(
  promotionCodeId: string | null,
  active: boolean,
): Promise<void> {
  if (!promotionCodeId || !isStripeEnabled()) return;
  try {
    await getStripe().promotionCodes.update(promotionCodeId, { active });
  } catch (err) {
    console.error("[coupons] could not sync promotion code state", { promotionCodeId, err });
  }
}
