import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { couponRedemptions, coupons } from "@/db/schema";
import { ApiError, clientIp, handler, ok, parseBody, parseQuery } from "@/lib/api";
import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth/session";
import { serialiseCoupon } from "@/lib/coupons";
import { couponCreateSchema, couponListSchema } from "@/lib/schemas/billing";
import { getStripe, isStripeEnabled } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/admin/coupons - list with live redemption counts. */
export const GET = handler(async (req: Request) => {
  await requireAdmin();
  const query = parseQuery(req, couponListSchema);

  const filters = [
    query.q ? sql`lower(${coupons.code}) like ${`%${query.q.toLowerCase()}%`}` : undefined,
    query.active === undefined ? undefined : eq(coupons.isActive, query.active),
  ].filter(Boolean);

  const rows = await db
    .select({
      coupon: coupons,
      redemptions: sql<number>`(
        select count(*)::int from ${couponRedemptions}
        where ${couponRedemptions.couponId} = ${coupons.id}
      )`,
    })
    .from(coupons)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(coupons.createdAt))
    .limit(query.limit)
    .offset(query.offset);

  return ok({
    data: rows.map((r) => serialiseCoupon(r.coupon, { redemptionCount: Number(r.redemptions) })),
    stripe_enabled: isStripeEnabled(),
  });
});

/**
 * POST /api/v1/admin/coupons
 *
 * Creates the local coupon and, when Stripe is configured, the matching Stripe
 * Coupon + Promotion Code. With Stripe unconfigured the code is stored locally
 * only and mirrored into Stripe the first time it is used at checkout.
 */
export const POST = handler(async (req: Request) => {
  const admin = await requireAdmin();
  const input = await parseBody(req, couponCreateSchema);
  const code = input.code.toUpperCase();

  const [clash] = await db
    .select({ id: coupons.id })
    .from(coupons)
    .where(sql`lower(${coupons.code}) = lower(${code})`)
    .limit(1);
  if (clash) throw new ApiError("CONFLICT", "That code already exists.");

  let stripeCouponId: string | null = null;
  let stripePromotionCodeId: string | null = null;

  if (isStripeEnabled()) {
    const stripe = getStripe();
    const stripeCoupon = await stripe.coupons.create({
      name: code,
      // 'once' applies the discount to the first invoice only - the safe default
      // for a launch promo. Longer durations are a deliberate, manual decision.
      duration: "once",
      ...(input.discountType === "percent"
        ? { percent_off: input.discountValue }
        : { amount_off: input.discountValue, currency: input.currency.toLowerCase() }),
      ...(input.maxRedemptions ? { max_redemptions: input.maxRedemptions } : {}),
      ...(input.expiresAt ? { redeem_by: Math.floor(input.expiresAt.getTime() / 1000) } : {}),
    });
    stripeCouponId = stripeCoupon.id;

    const promo = await stripe.promotionCodes.create({
      promotion: { type: "coupon", coupon: stripeCoupon.id },
      code,
      ...(input.maxRedemptions ? { max_redemptions: input.maxRedemptions } : {}),
      ...(input.expiresAt ? { expires_at: Math.floor(input.expiresAt.getTime() / 1000) } : {}),
    });
    stripePromotionCodeId = promo.id;
  }

  const [created] = await db
    .insert(coupons)
    .values({
      code,
      description: input.description ?? null,
      discountType: input.discountType,
      discountValue: input.discountValue,
      currency: input.currency,
      stripeCouponId,
      stripePromotionCodeId,
      topicId: input.topicId ?? null,
      orgId: input.orgId ?? null,
      maxRedemptions: input.maxRedemptions ?? null,
      perUserLimit: input.perUserLimit,
      startsAt: input.startsAt ?? null,
      expiresAt: input.expiresAt ?? null,
      isActive: true,
      createdBy: admin.id,
    })
    .returning();

  if (!created) throw new ApiError("SERVER_ERROR", "Could not create the coupon.");

  await audit({
    actorId: admin.id,
    action: "admin.coupon_created",
    entityType: "coupon",
    entityId: created.id,
    metadata: {
      code,
      discount_type: created.discountType,
      discount_value: created.discountValue,
      stripe_linked: Boolean(stripeCouponId),
    },
    ipAddress: clientIp(req),
  });

  return ok({ coupon: serialiseCoupon(created, { redemptionCount: 0 }) }, 201);
});
