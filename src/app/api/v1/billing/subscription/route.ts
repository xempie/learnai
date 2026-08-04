import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { subscriptions } from "@/db/schema";
import { handler, ok } from "@/lib/api";
import { requireAuth } from "@/lib/auth/session";
import { getEntitlements, serialiseEntitlements } from "@/lib/entitlements";
import { isStripeEnabled, serialiseSubscription } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/billing/subscription
 * The caller's own subscription plus the entitlements it grants. Works with
 * Stripe unconfigured - the pilot trial lives on the user row.
 */
export const GET = handler(async () => {
  const user = await requireAuth();

  // Prefer a real Stripe-backed subscription over the customer-only placeholder.
  const [real] = await db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.userId, user.id),
        isNotNull(subscriptions.stripeSubscriptionId),
      ),
    )
    .orderBy(desc(subscriptions.updatedAt))
    .limit(1);

  let row = real;
  if (!row) {
    [row] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, user.id))
      .orderBy(desc(subscriptions.updatedAt))
      .limit(1);
  }

  const entitlements = await getEntitlements(user.id);

  return ok({
    subscription: serialiseSubscription(row),
    entitlements: serialiseEntitlements(entitlements),
    billing_enabled: isStripeEnabled(),
  });
});
