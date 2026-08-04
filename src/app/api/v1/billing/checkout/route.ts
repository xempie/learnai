import { eq } from "drizzle-orm";
import { db } from "@/db";
import { coupons } from "@/db/schema";
import { ApiError, clientIp, handler, ok, rateLimit } from "@/lib/api";
import { audit } from "@/lib/audit";
import { config } from "@/lib/config";
import { validateCoupon } from "@/lib/coupons";
import { requireAuth } from "@/lib/auth/session";
import { checkoutBodySchema, parseOptionalBody } from "@/lib/schemas/billing";
import { ensureStripeCustomer, getStripe, isStripeEnabled } from "@/lib/stripe";
import type Stripe from "stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/billing/checkout
 *
 * Creates a Stripe Checkout Session for the individual subscription. The client
 * may send a coupon CODE; the discount itself is always re-derived from the
 * stored coupon row, never from the request.
 */
export const POST = handler(async (req: Request) => {
  const user = await requireAuth();

  // The platform is free (SERVICES_ACTION_PLAN §1) - billing stays dormant even
  // if Stripe credentials are configured.
  if (!config.flags.billing || config.flags.freePlatform) {
    throw new ApiError("NOT_CONFIGURED", "Billing is not enabled on this platform.");
  }

  if (!isStripeEnabled() || !config.stripe.priceIdIndividual) {
    throw new ApiError(
      "NOT_CONFIGURED",
      "Billing is not configured on this deployment. The free tier and pilot trial still work.",
    );
  }

  rateLimit(`checkout:${user.id}`, 10, 60_000);

  const { couponCode } = await parseOptionalBody(req, checkoutBodySchema);
  const stripe = getStripe();
  const customerId = await ensureStripeCustomer(user);

  let discounts: Stripe.Checkout.SessionCreateParams.Discount[] | undefined;
  let appliedCouponId: string | null = null;

  if (couponCode) {
    const result = await validateCoupon(couponCode, user.id, { orgId: user.orgId });
    if (!result.valid) {
      throw new ApiError("BAD_REQUEST", result.message);
    }
    const stripeRef = await ensureStripeDiscount(result.coupon);
    discounts = [stripeRef];
    appliedCouponId = result.coupon.id;
  }

  const trialDays = config.limits.trialDays > 0 ? config.limits.trialDays : undefined;

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: config.stripe.priceIdIndividual, quantity: 1 }],
    client_reference_id: user.id,
    // The webhook trusts only what it reads back off these objects.
    metadata: {
      app_user_id: user.id,
      ...(appliedCouponId ? { app_coupon_id: appliedCouponId } : {}),
    },
    subscription_data: {
      ...(trialDays ? { trial_period_days: trialDays } : {}),
      metadata: { app_user_id: user.id },
    },
    ...(discounts ? { discounts } : { allow_promotion_codes: true }),
    success_url: `${config.appUrl}/settings?checkout=success#subscription`,
    cancel_url: `${config.appUrl}/settings?checkout=cancelled#subscription`,
  });

  if (!session.url) {
    throw new ApiError("SERVER_ERROR", "Stripe did not return a checkout URL.");
  }

  await audit({
    actorId: user.id,
    action: "billing.checkout_started",
    entityType: "checkout_session",
    entityId: session.id,
    metadata: { coupon_id: appliedCouponId, trial_days: trialDays ?? 0 },
    ipAddress: clientIp(req),
  });

  return ok({ url: session.url });
});

/**
 * Coupons may exist locally only (Stripe unconfigured when they were created).
 * Mirror them into Stripe on first use and cache the ids so the next checkout
 * reuses the same objects.
 */
async function ensureStripeDiscount(
  coupon: typeof coupons.$inferSelect,
): Promise<Stripe.Checkout.SessionCreateParams.Discount> {
  if (coupon.stripePromotionCodeId) return { promotion_code: coupon.stripePromotionCodeId };
  if (coupon.stripeCouponId) return { coupon: coupon.stripeCouponId };

  const stripe = getStripe();
  const created = await stripe.coupons.create({
    name: coupon.code,
    duration: "once",
    ...(coupon.discountType === "percent"
      ? { percent_off: coupon.discountValue }
      : { amount_off: coupon.discountValue, currency: coupon.currency.toLowerCase() }),
    metadata: { app_coupon_id: coupon.id },
  });

  await db
    .update(coupons)
    .set({ stripeCouponId: created.id, updatedAt: new Date() })
    .where(eq(coupons.id, coupon.id));

  return { coupon: created.id };
}
