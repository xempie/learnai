import { z } from "zod";
import { ApiError } from "@/lib/api";

/**
 * Request schemas for billing, coupons, admin analytics, moderation and users.
 *
 * Nothing here accepts a role, a publish state, a price or a discount amount -
 * those are always re-derived server-side. Coupons travel as a CODE and are
 * looked up; discounts are computed from the stored row (TECHNICAL_SPEC §12.1).
 */

/* ---------- primitives ---------- */

const uuid = z.string().uuid();

/** Query params arrive as strings; treat "" as absent. */
const blankToUndefined = <T extends z.ZodTypeAny>(inner: T) =>
  z.preprocess((v) => (v === "" || v === null ? undefined : v), inner.optional());

const isoDate = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), { message: "Expected an ISO-8601 date." })
  .transform((v) => new Date(v));

const couponCode = z
  .string()
  .trim()
  .min(3, "Codes are at least 3 characters.")
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, "Use letters, numbers, hyphens and underscores only.");

const boolish = z.preprocess(
  (v) => (v === "true" || v === "1" ? true : v === "false" || v === "0" ? false : v),
  z.boolean(),
);

const positiveInt = z.coerce.number().int().positive();

/**
 * POST bodies on these routes are frequently empty. `parseBody` rejects an empty
 * body as malformed JSON, so read leniently and let the schema decide.
 */
export async function parseOptionalBody<S extends z.ZodType>(
  req: Request,
  schema: S,
): Promise<z.output<S>> {
  const raw = await req.text();
  let parsed: unknown = {};
  if (raw.trim()) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new ApiError("BAD_REQUEST", "Request body must be valid JSON.");
    }
  }
  const result = schema.safeParse(parsed);
  if (!result.success) {
    const details: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join(".") || "_";
      if (!details[key]) details[key] = issue.message;
    }
    throw new ApiError("VALIDATION_FAILED", "Invalid request.", details);
  }
  return result.data as z.output<S>;
}

/* ---------- billing ---------- */

export const checkoutBodySchema = z
  .object({
    couponCode: couponCode.optional(),
    coupon_code: couponCode.optional(),
  })
  .transform((v) => ({ couponCode: v.couponCode ?? v.coupon_code ?? null }));

export const couponValidateSchema = z.object({
  code: z.string().trim().min(1, "Enter a code.").max(64),
});

/* ---------- admin coupons ---------- */

export const couponCreateSchema = z
  .object({
    code: couponCode,
    description: z.string().trim().max(200).optional(),
    discountType: z.enum(["percent", "fixed"]),
    discountValue: z.coerce.number().int(),
    currency: z.string().trim().length(3).toUpperCase().default("AUD"),
    topicId: uuid.nullish(),
    orgId: uuid.nullish(),
    maxRedemptions: positiveInt.nullish(),
    perUserLimit: positiveInt.default(1),
    startsAt: isoDate.nullish(),
    expiresAt: isoDate.nullish(),
  })
  .superRefine((v, ctx) => {
    if (v.discountType === "percent" && (v.discountValue < 1 || v.discountValue > 100)) {
      ctx.addIssue({
        code: "custom",
        path: ["discountValue"],
        message: "Percentage discounts must be between 1 and 100.",
      });
    }
    if (v.discountType === "fixed" && v.discountValue <= 0) {
      ctx.addIssue({
        code: "custom",
        path: ["discountValue"],
        message: "Fixed discounts must be greater than zero.",
      });
    }
    if (v.expiresAt && v.expiresAt.getTime() <= Date.now()) {
      ctx.addIssue({
        code: "custom",
        path: ["expiresAt"],
        message: "Expiry must be in the future.",
      });
    }
    if (v.startsAt && v.expiresAt && v.startsAt >= v.expiresAt) {
      ctx.addIssue({
        code: "custom",
        path: ["startsAt"],
        message: "Start must be before expiry.",
      });
    }
  });

export const couponUpdateSchema = z
  .object({
    description: z.string().trim().max(200).nullish(),
    isActive: z.boolean().optional(),
    maxRedemptions: positiveInt.nullish(),
    perUserLimit: positiveInt.optional(),
    startsAt: isoDate.nullish(),
    expiresAt: isoDate.nullish(),
  })
  .superRefine((v, ctx) => {
    if (v.expiresAt && v.expiresAt.getTime() <= Date.now()) {
      ctx.addIssue({
        code: "custom",
        path: ["expiresAt"],
        message: "Expiry must be in the future.",
      });
    }
  });

export const couponListSchema = z.object({
  q: blankToUndefined(z.string().trim().max(64)),
  active: blankToUndefined(boolish),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

/* ---------- admin analytics ---------- */

export const DEFAULT_RANGE_DAYS = 30;

export const dateRangeSchema = z.object({
  from: blankToUndefined(isoDate),
  to: blankToUndefined(isoDate),
});

export interface DateRange {
  from: Date;
  to: Date;
}

/** Clamps a `?from=&to=` pair, defaulting to the last 30 days. */
export function resolveRange(input: { from?: Date; to?: Date }): DateRange {
  const to = input.to ?? new Date();
  const from =
    input.from ?? new Date(to.getTime() - DEFAULT_RANGE_DAYS * 24 * 60 * 60 * 1000);
  if (from > to) {
    throw new ApiError("VALIDATION_FAILED", "`from` must be before `to`.");
  }
  return { from, to };
}

export const timeseriesSchema = dateRangeSchema.extend({
  metric: z.enum(["views", "registrations"]).default("views"),
});

export const topContentSchema = dateRangeSchema.extend({
  sort: z.enum(["views", "likes", "comments", "bookmarks"]).default("views"),
  type: blankToUndefined(z.enum(["topic", "article"])),
  category_id: blankToUndefined(uuid),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const retentionSchema = dateRangeSchema.extend({
  weeks: z.coerce.number().int().min(1).max(26).default(8),
});

/* ---------- admin moderation ---------- */

export const adminCommentListSchema = z.object({
  status: blankToUndefined(z.enum(["visible", "hidden", "deleted"])),
  reported: blankToUndefined(boolish),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const commentActionSchema = z.object({
  action: z.enum(["hide", "unhide"]),
  reason: z.string().trim().max(200).optional(),
});

export const reportListSchema = z.object({
  status: z.enum(["open", "resolved", "dismissed"]).default("open"),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const reportResolveSchema = z.object({
  action: z.enum(["hide", "dismiss"]),
  notes: z.string().trim().max(500).optional(),
});

/* ---------- admin users ---------- */

export const adminUserListSchema = z.object({
  q: blankToUndefined(z.string().trim().max(120)),
  org_id: blankToUndefined(uuid),
  status: blankToUndefined(z.enum(["active", "suspended", "unverified", "deleted"])),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const adminUserActionSchema = z.object({
  action: z.enum(["suspend", "unsuspend", "resend_verification"]),
  reason: z.string().trim().max(200).optional(),
});
