import { ApiError, clientIp, handler, ok, rateLimit } from "@/lib/api";
import { audit } from "@/lib/audit";
import { requireAuth } from "@/lib/auth/session";
import { config } from "@/lib/config";
import { findStripeCustomerId, getStripe, isStripeEnabled } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/billing/portal
 * Stripe Billing Portal session for the caller's own customer. Never accepts a
 * customer id from the client.
 */
export const POST = handler(async (req: Request) => {
  const user = await requireAuth();

  // The platform is free (SERVICES_ACTION_PLAN §1) - billing stays dormant even
  // if Stripe credentials are configured.
  if (!config.flags.billing || config.flags.freePlatform) {
    throw new ApiError("NOT_CONFIGURED", "Billing is not enabled on this platform.");
  }

  if (!isStripeEnabled()) {
    throw new ApiError(
      "NOT_CONFIGURED",
      "Billing is not configured on this deployment, so there is no portal to open.",
    );
  }

  rateLimit(`portal:${user.id}`, 10, 60_000);

  const customerId = await findStripeCustomerId(user.id);
  if (!customerId) {
    throw new ApiError("NOT_FOUND", "You don't have a billing account yet.");
  }

  const session = await getStripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: `${config.appUrl}/settings/billing`,
  });

  await audit({
    actorId: user.id,
    action: "billing.portal_opened",
    entityType: "customer",
    entityId: customerId,
    ipAddress: clientIp(req),
  });

  return ok({ url: session.url });
});
