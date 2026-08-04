import { handler, ok, parseBody, rateLimit } from "@/lib/api";
import { requireAuth } from "@/lib/auth/session";
import { validateCoupon } from "@/lib/coupons";
import { couponValidateSchema } from "@/lib/schemas/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/billing/coupon/validate
 *
 * Checks a code WITHOUT redeeming it, so the checkout form can show the real
 * discount before the user commits. Rate limited to 10/min per user: this
 * endpoint is otherwise an oracle for brute-forcing valid codes.
 */
export const POST = handler(async (req: Request) => {
  const user = await requireAuth();
  rateLimit(`coupon-validate:${user.id}`, 10, 60_000);

  const { code } = await parseBody(req, couponValidateSchema);
  const result = await validateCoupon(code, user.id, { orgId: user.orgId });

  if (!result.valid) {
    // 200 with valid:false - an invalid code is a normal form state, and a
    // distinct status code would leak which codes exist.
    return ok({
      valid: false,
      discount_type: null,
      discount_value: null,
      description: null,
      message: result.message,
    });
  }

  return ok({
    valid: true,
    discount_type: result.coupon.discountType,
    discount_value: result.coupon.discountValue,
    description: result.coupon.description,
    message: result.message,
  });
});
