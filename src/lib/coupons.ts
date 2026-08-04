import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { db, type Db } from "@/db";
import { couponRedemptions, coupons } from "@/db/schema";

/**
 * Coupon validation and redemption.
 *
 * Validation is deliberately server-only and never trusts a client-supplied
 * discount: the caller sends a CODE, we look the row up and re-derive the
 * amount. `validateCoupon` returns a discriminated result rather than throwing
 * for the "this code is not usable" case so the public validate endpoint can
 * answer with a friendly message without leaking whether the code exists.
 */

export type Coupon = typeof coupons.$inferSelect;

/** A drizzle transaction handle, structurally compatible with `db`. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;

export type CouponRejection =
  | "not_found"
  | "inactive"
  | "not_started"
  | "expired"
  | "exhausted"
  | "user_limit_reached"
  | "org_restricted"
  | "topic_restricted";

export type CouponValidation =
  | { valid: true; coupon: Coupon; message: string }
  | { valid: false; reason: CouponRejection; message: string };

const MESSAGES: Record<CouponRejection, string> = {
  not_found: "That code isn't valid.",
  inactive: "That code isn't valid.",
  not_started: "That code isn't active yet.",
  expired: "That code has expired.",
  exhausted: "That code has been fully redeemed.",
  user_limit_reached: "You've already used that code.",
  org_restricted: "That code isn't available for your account.",
  topic_restricted: "That code doesn't apply to this purchase.",
};

function reject(reason: CouponRejection): CouponValidation {
  return { valid: false, reason, message: MESSAGES[reason] };
}

export interface ValidateOptions {
  /** The buyer's organisation, used when the coupon is org-restricted. */
  orgId?: string | null;
  /** The topic being bought, used when the coupon is topic-restricted. */
  topicId?: string | null;
  /** Point in time to evaluate against; defaults to now. */
  at?: Date;
}

/**
 * Case-insensitive lookup plus every eligibility rule. Does NOT redeem, does
 * not mutate anything, and is safe to call from a rate-limited public endpoint.
 */
export async function validateCoupon(
  code: string,
  userId: string,
  opts: ValidateOptions = {},
): Promise<CouponValidation> {
  const trimmed = code.trim();
  if (!trimmed) return reject("not_found");

  const [row] = await db
    .select()
    .from(coupons)
    .where(sql`lower(${coupons.code}) = lower(${trimmed})`)
    .limit(1);

  if (!row) return reject("not_found");
  if (!row.isActive) return reject("inactive");

  const now = opts.at ?? new Date();
  if (row.startsAt && row.startsAt > now) return reject("not_started");
  if (row.expiresAt && row.expiresAt <= now) return reject("expired");

  if (row.maxRedemptions !== null && row.redemptionCount >= row.maxRedemptions) {
    return reject("exhausted");
  }

  if (row.orgId && row.orgId !== (opts.orgId ?? null)) {
    return reject("org_restricted");
  }

  if (row.topicId && opts.topicId !== undefined && row.topicId !== opts.topicId) {
    return reject("topic_restricted");
  }

  if (row.perUserLimit > 0) {
    const [used] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(couponRedemptions)
      .where(
        and(eq(couponRedemptions.couponId, row.id), eq(couponRedemptions.userId, userId)),
      );
    if ((used?.count ?? 0) >= row.perUserLimit) return reject("user_limit_reached");
  }

  return { valid: true, coupon: row, message: describe(row) };
}

/** Human-readable summary of what the code does. */
export function describe(coupon: Coupon): string {
  const value =
    coupon.discountType === "percent"
      ? `${coupon.discountValue}% off`
      : `${formatMoney(coupon.discountValue, coupon.currency)} off`;
  return coupon.description ? `${value} - ${coupon.description}` : value;
}

function formatMoney(cents: number, currency: string): string {
  return `${currency} $${(cents / 100).toFixed(2)}`;
}

/** Percent or fixed, clamped to the subtotal and never negative. */
export function computeDiscountCents(
  coupon: Pick<Coupon, "discountType" | "discountValue">,
  subtotalCents: number,
): number {
  if (subtotalCents <= 0) return 0;
  const raw =
    coupon.discountType === "percent"
      ? Math.floor((subtotalCents * coupon.discountValue) / 100)
      : coupon.discountValue;
  return Math.max(0, Math.min(subtotalCents, raw));
}

/**
 * Records a redemption and bumps the counter in one statement pair inside the
 * caller's transaction. The UPDATE re-checks `max_redemptions` in its WHERE so
 * two concurrent checkouts can't push the coupon past its cap.
 *
 * Returns false when the coupon was exhausted between validation and redemption;
 * the caller should roll back rather than granting an unfunded discount.
 */
export async function redeemCoupon(
  tx: DbOrTx,
  couponId: string,
  userId: string,
  orderId: string | null,
  amountOffCents: number,
): Promise<boolean> {
  const claimed = await tx
    .update(coupons)
    .set({
      redemptionCount: sql`${coupons.redemptionCount} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(coupons.id, couponId),
        eq(coupons.isActive, true),
        sql`(${coupons.maxRedemptions} is null or ${coupons.redemptionCount} < ${coupons.maxRedemptions})`,
      ),
    )
    .returning({ id: coupons.id });

  if (claimed.length === 0) return false;

  await tx.insert(couponRedemptions).values({
    couponId,
    userId,
    orderId,
    amountOffCents: Math.max(0, amountOffCents),
  });
  return true;
}

/** Admin/list shape. Never exposes who redeemed - only how many times. */
export function serialiseCoupon(
  coupon: Coupon,
  extra: { redemptionCount?: number } = {},
) {
  return {
    id: coupon.id,
    code: coupon.code,
    description: coupon.description,
    discount_type: coupon.discountType,
    discount_value: coupon.discountValue,
    currency: coupon.currency,
    stripe_coupon_id: coupon.stripeCouponId,
    stripe_promotion_code_id: coupon.stripePromotionCodeId,
    topic_id: coupon.topicId,
    org_id: coupon.orgId,
    max_redemptions: coupon.maxRedemptions,
    redemption_count: extra.redemptionCount ?? coupon.redemptionCount,
    per_user_limit: coupon.perUserLimit,
    starts_at: coupon.startsAt?.toISOString() ?? null,
    expires_at: coupon.expiresAt?.toISOString() ?? null,
    is_active: coupon.isActive,
    created_at: coupon.createdAt.toISOString(),
  };
}
