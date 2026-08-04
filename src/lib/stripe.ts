import "server-only";

import Stripe from "stripe";
import { and, desc, eq, isNotNull, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { subscriptions } from "@/db/schema";
import { ApiError } from "@/lib/api";
import { config } from "@/lib/config";

/**
 * Stripe access point.
 *
 * The whole product must run end-to-end with NO Stripe keys configured - local
 * dev, demos and the pilot cohort all work on the card-free trial stored on
 * `users.trial_ends_at`. So the client is constructed lazily and every billing
 * route checks `isStripeEnabled()` first and answers 501 NOT_CONFIGURED rather
 * than throwing at import time (TECHNICAL_SPEC §7.8).
 */

let memo: Stripe | null = null;

export function isStripeEnabled(): boolean {
  return config.stripe.enabled;
}

/** Memoised client. Throws NOT_CONFIGURED (501) when the secret key is absent. */
export function getStripe(): Stripe {
  const key = config.stripe.secretKey;
  if (!key) {
    throw new ApiError(
      "NOT_CONFIGURED",
      "Billing is not configured on this deployment.",
    );
  }
  if (!memo) {
    memo = new Stripe(key, {
      // No apiVersion pin: the installed stripe-node is already pinned to the
      // version its types were generated from.
      maxNetworkRetries: 2,
      timeout: 15_000,
      appInfo: { name: "Acadu", url: config.appUrl },
    });
  }
  return memo;
}

/** Local subscription status enum (see the subscriptions_status check constraint). */
export type LocalSubStatus = "trialing" | "active" | "past_due" | "canceled" | "incomplete";

/** Stripe has more states than we care about; collapse them onto the local enum. */
export function mapStripeStatus(status: Stripe.Subscription.Status): LocalSubStatus {
  switch (status) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "canceled";
    case "incomplete":
    case "paused":
      return "incomplete";
    default:
      return "incomplete";
  }
}

function toDate(seconds: number | null | undefined): Date | null {
  return typeof seconds === "number" && Number.isFinite(seconds)
    ? new Date(seconds * 1000)
    : null;
}

export function stripeCustomerId(sub: Stripe.Subscription): string | null {
  const c = sub.customer;
  if (!c) return null;
  return typeof c === "string" ? c : c.id;
}

/**
 * The period end moved off the Subscription object and onto its items in recent
 * API versions; read the earliest item end so a multi-item subscription still
 * expires when the first item does.
 */
function periodEnd(sub: Stripe.Subscription): Date | null {
  const ends = sub.items?.data
    ?.map((item) => item.current_period_end)
    .filter((n): n is number => typeof n === "number");
  if (!ends || ends.length === 0) return null;
  return new Date(Math.min(...ends) * 1000);
}

/**
 * Resolve the local user a Stripe subscription belongs to. Never trusts the
 * client - the id comes from metadata we set ourselves at checkout, or from the
 * row we already persisted for that customer.
 */
async function resolveUserId(sub: Stripe.Subscription): Promise<string | null> {
  const existing = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.stripeSubscriptionId, sub.id),
    columns: { userId: true },
  });
  if (existing?.userId) return existing.userId;

  const fromMetadata = sub.metadata?.app_user_id;
  if (fromMetadata) return fromMetadata;

  const customer = stripeCustomerId(sub);
  if (!customer) return null;
  const byCustomer = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.stripeCustomerId, customer),
    columns: { userId: true },
  });
  return byCustomer?.userId ?? null;
}

export interface SyncResult {
  synced: boolean;
  userId: string | null;
  status: LocalSubStatus | null;
}

/**
 * Upsert the local `subscriptions` row from a Stripe subscription object.
 * Idempotent: safe to call repeatedly for the same subscription (webhooks may
 * arrive out of order, and `customer.subscription.updated` fires often).
 */
export async function syncSubscriptionFromStripe(
  stripeSub: Stripe.Subscription,
): Promise<SyncResult> {
  const userId = await resolveUserId(stripeSub);
  if (!userId) {
    // Nothing to attach it to (e.g. a subscription created straight in the
    // Stripe dashboard). Log and drop rather than corrupting the table.
    console.warn("[stripe] subscription with no local user", { id: stripeSub.id });
    return { synced: false, userId: null, status: null };
  }

  const status = mapStripeStatus(stripeSub.status);
  const values = {
    userId,
    orgId: null,
    stripeCustomerId: stripeCustomerId(stripeSub),
    stripeSubscriptionId: stripeSub.id,
    status,
    plan: "individual" as const,
    trialEndsAt: toDate(stripeSub.trial_end),
    currentPeriodEnd: periodEnd(stripeSub),
    cancelAtPeriodEnd: Boolean(stripeSub.cancel_at_period_end),
    updatedAt: new Date(),
  };

  // Checkout parks a customer-only placeholder row before Stripe knows about a
  // subscription; claim it rather than leaving an orphan behind.
  const [claimable] = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(
      or(
        eq(subscriptions.stripeSubscriptionId, stripeSub.id),
        and(eq(subscriptions.userId, userId), isNull(subscriptions.stripeSubscriptionId)),
      ),
    )
    .orderBy(desc(subscriptions.updatedAt))
    .limit(1);

  if (claimable) {
    await db.update(subscriptions).set(values).where(eq(subscriptions.id, claimable.id));
  } else {
    await db
      .insert(subscriptions)
      .values(values)
      .onConflictDoUpdate({
        target: subscriptions.stripeSubscriptionId,
        set: {
          stripeCustomerId: values.stripeCustomerId,
          status: values.status,
          plan: values.plan,
          trialEndsAt: values.trialEndsAt,
          currentPeriodEnd: values.currentPeriodEnd,
          cancelAtPeriodEnd: values.cancelAtPeriodEnd,
          updatedAt: values.updatedAt,
        },
      });
  }

  return { synced: true, userId, status };
}

/* ---------- customer bookkeeping ---------- */

/** The Stripe customer already persisted for this user, if any. */
export async function findStripeCustomerId(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ customerId: subscriptions.stripeCustomerId })
    .from(subscriptions)
    .where(and(eq(subscriptions.userId, userId), isNotNull(subscriptions.stripeCustomerId)))
    .orderBy(desc(subscriptions.updatedAt))
    .limit(1);
  return row?.customerId ?? null;
}

/**
 * Reuse the caller's Stripe customer or create one, persisting the id locally so
 * the next checkout, the billing portal and every webhook can find it again.
 */
export async function ensureStripeCustomer(user: {
  id: string;
  email: string;
  nickname: string;
}): Promise<string> {
  const existing = await findStripeCustomerId(user.id);
  if (existing) return existing;

  const customer = await getStripe().customers.create({
    email: user.email,
    name: user.nickname,
    metadata: { app_user_id: user.id },
  });

  // Park the customer id on a placeholder row; the webhook claims it when the
  // subscription itself is created.
  const [placeholder] = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(and(eq(subscriptions.userId, user.id), isNull(subscriptions.stripeSubscriptionId)))
    .limit(1);

  if (placeholder) {
    await db
      .update(subscriptions)
      .set({ stripeCustomerId: customer.id, updatedAt: new Date() })
      .where(eq(subscriptions.id, placeholder.id));
  } else {
    await db.insert(subscriptions).values({
      userId: user.id,
      stripeCustomerId: customer.id,
      status: "incomplete",
      plan: "free",
    });
  }

  return customer.id;
}

/** Public shape for GET /billing/subscription. */
export function serialiseSubscription(row: typeof subscriptions.$inferSelect | undefined | null) {
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    plan: row.plan,
    trial_ends_at: row.trialEndsAt?.toISOString() ?? null,
    current_period_end: row.currentPeriodEnd?.toISOString() ?? null,
    cancel_at_period_end: row.cancelAtPeriodEnd,
    created_at: row.createdAt.toISOString(),
  };
}
