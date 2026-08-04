import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { processedWebhookEvents, subscriptions } from "@/db/schema";
import { ApiError, handler, ok } from "@/lib/api";
import { audit } from "@/lib/audit";
import { config } from "@/lib/config";
import { redeemCoupon } from "@/lib/coupons";
import { getStripe, isStripeEnabled, syncSubscriptionFromStripe } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/webhooks/stripe
 *
 * Three non-negotiables (TECHNICAL_SPEC §7.8):
 *  1. The signature is verified against the RAW body. Parsing to JSON first and
 *     re-serialising changes the bytes and every signature check fails.
 *  2. The event id is claimed in `processed_webhook_events` BEFORE any work.
 *     Stripe retries aggressively; processing an event twice double-grants
 *     entitlements and double-counts coupon redemptions.
 *  3. It answers 200 fast. Slow handlers cause Stripe to time out and retry,
 *     which turns a slow bug into a duplicate-processing bug.
 */
export const POST = handler(async (req: Request) => {
  if (!isStripeEnabled() || !config.stripe.webhookSecret) {
    throw new ApiError("NOT_CONFIGURED", "Stripe webhooks are not configured.");
  }

  // RAW body - never req.json().
  const raw = await req.text();
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    throw new ApiError("BAD_REQUEST", "Missing stripe-signature header.");
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(raw, signature, config.stripe.webhookSecret);
  } catch (err) {
    console.error("[stripe-webhook] signature verification failed", err);
    throw new ApiError("BAD_REQUEST", "Signature verification failed.");
  }

  // Claim the event id first. A unique violation means a retry of something we
  // already handled: acknowledge and do nothing.
  const claimed = await db
    .insert(processedWebhookEvents)
    .values({ eventId: event.id, eventType: event.type })
    .onConflictDoNothing({ target: processedWebhookEvents.eventId })
    .returning({ eventId: processedWebhookEvents.eventId });

  if (claimed.length === 0) {
    return ok({ received: true, duplicate: true });
  }

  try {
    await process(event);
  } catch (err) {
    // Release the claim so a manual resend from the Stripe dashboard can repair
    // state, but still answer 200 - a 500 here just adds retries on top of a
    // handler that is already failing.
    console.error("[stripe-webhook] processing failed", { id: event.id, type: event.type, err });
    await db
      .delete(processedWebhookEvents)
      .where(eq(processedWebhookEvents.eventId, event.id))
      .catch(() => undefined);
    return ok({ received: true, processed: false });
  }

  return ok({ received: true });
});

async function process(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed":
      await onCheckoutCompleted(event.data.object);
      return;

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await syncSubscriptionFromStripe(event.data.object);
      return;

    case "invoice.payment_succeeded":
    case "invoice.payment_failed":
      await onInvoice(event.data.object, event.type);
      return;

    default:
      // Everything else is acknowledged and ignored on purpose.
      return;
  }
}

/* ---------- handlers ---------- */

async function onCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const subscriptionId =
    typeof session.subscription === "string" ? session.subscription : session.subscription?.id;

  if (subscriptionId) {
    const sub = await getStripe().subscriptions.retrieve(subscriptionId);
    await syncSubscriptionFromStripe(sub);
  }

  // Record the coupon redemption exactly once, from OUR metadata - never from
  // whatever discount amount the client claimed at checkout time.
  const couponId = session.metadata?.app_coupon_id;
  const userId = session.metadata?.app_user_id ?? session.client_reference_id;
  if (couponId && userId) {
    const amountOff = session.total_details?.amount_discount ?? 0;
    await db.transaction(async (tx) => {
      const redeemed = await redeemCoupon(tx, couponId, userId, null, amountOff);
      if (!redeemed) {
        console.warn("[stripe-webhook] coupon exhausted at redemption", { couponId });
      }
    });
  }

  await audit({
    actorId: userId ?? null,
    action: "billing.checkout_completed",
    entityType: "checkout_session",
    entityId: session.id,
    metadata: { subscription_id: subscriptionId ?? null, coupon_id: couponId ?? null },
  });
}

async function onInvoice(
  invoice: Stripe.Invoice,
  type: "invoice.payment_succeeded" | "invoice.payment_failed",
): Promise<void> {
  const parent = invoice.parent?.subscription_details?.subscription;
  const subscriptionId = typeof parent === "string" ? parent : parent?.id;
  if (!subscriptionId) return;

  if (type === "invoice.payment_succeeded") {
    // Re-read the subscription so status, period end and trial all come from
    // Stripe rather than being inferred from the invoice.
    const sub = await getStripe().subscriptions.retrieve(subscriptionId);
    await syncSubscriptionFromStripe(sub);
    return;
  }

  // Payment failed: mark past_due immediately so entitlements react without
  // waiting for the subscription.updated event.
  await db
    .update(subscriptions)
    .set({ status: "past_due", updatedAt: new Date() })
    .where(eq(subscriptions.stripeSubscriptionId, subscriptionId));

  await audit({
    action: "billing.payment_failed",
    entityType: "subscription",
    entityId: subscriptionId,
    metadata: { invoice_id: invoice.id ?? null },
  });
}
