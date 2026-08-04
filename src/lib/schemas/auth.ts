/**
 * Zod schemas shared by the auth, profile and organisation routes.
 *
 * The age gate lives here too (TECHNICAL_SPEC §9.4): it is ENFORCED, not merely
 * recorded. `under-16` is rejected explicitly with its own message so the client
 * can show the right copy rather than a generic "invalid value".
 */

import { z } from "zod";
import { ApiError } from "@/lib/api";

/* ---------------- age ---------------- */

export const AGE_RANGES = ["16-24", "25-34", "35-44", "45-54", "55-64", "65+"] as const;
export type AgeRange = (typeof AGE_RANGES)[number];

export const ageRangeSchema = z.enum(AGE_RANGES);

/** Values a client might send for someone below the minimum age. */
const UNDER_AGE_VALUES = new Set([
  "under-16",
  "under_16",
  "under16",
  "<16",
  "0-15",
  "13-15",
  "under-18",
  "13-17",
]);

/**
 * Throws a 422 unless the supplied age range is one we accept. Callers use the
 * returned, normalised value - never the raw input.
 */
export function assertAllowedAgeRange(value: string): AgeRange {
  const v = value.trim().toLowerCase();

  if (UNDER_AGE_VALUES.has(v)) {
    throw new ApiError("VALIDATION_FAILED", "You must be at least 16 to create an account.", {
      ageRange: "You must be at least 16 to create an account.",
    });
  }
  if (!(AGE_RANGES as readonly string[]).includes(v)) {
    throw new ApiError("VALIDATION_FAILED", "Choose a valid age range.", {
      ageRange: `Age range must be one of: ${AGE_RANGES.join(", ")}.`,
    });
  }
  return v as AgeRange;
}

/* ---------------- primitives ---------------- */

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid email address."))
  .pipe(z.string().max(254, "That email address is too long."));

/** Minimum 10 characters (TECHNICAL_SPEC §9.1). */
export const passwordSchema = z
  .string()
  .min(10, "Password must be at least 10 characters.")
  .max(128, "Password must be 128 characters or fewer.");

export const nicknameSchema = z
  .string()
  .trim()
  .min(2, "Nickname must be at least 2 characters.")
  .max(32, "Nickname must be 32 characters or fewer.")
  .regex(
    /^[\p{L}\p{N}][\p{L}\p{N} ._'-]*$/u,
    "Nickname may only contain letters, numbers, spaces, apostrophes, dots, hyphens and underscores.",
  );

export const verificationCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "Enter the 6-digit code from your email.");

export const avatarKeySchema = z
  .string()
  .trim()
  .min(1, "Choose an avatar.")
  .max(512, "That avatar key is too long.");

export const skillLevelSchema = z.enum(["basic", "intermediate", "advanced"]);

/** Exactly three distinct categories (V1_BUILD_SPEC §4.2). */
export const categoryIdsSchema = z
  .array(z.uuid("Category ids must be UUIDs."))
  .length(3, "Choose exactly three categories.")
  .refine((ids) => new Set(ids).size === ids.length, {
    error: "Choose three different categories.",
  });

/* ---------------- auth ---------------- */

export const signupSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    nickname: nicknameSchema,
    /**
     * Deliberately a loose string: the age gate is applied by
     * `assertAllowedAgeRange` so `under-16` gets its own message.
     */
    ageRange: z.string().min(1, "Select your age range."),
    /** Explicit, unticked-by-default consent. */
    termsAccepted: z.boolean(),
  })
  .refine((d) => d.termsAccepted === true, {
    error: "You must accept the Terms of Service and Privacy Policy.",
    path: ["termsAccepted"],
  });

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password."),
});

export const verifyEmailSchema = z.object({
  email: emailSchema,
  code: verificationCodeSchema,
});

export const resendCodeSchema = z.object({
  email: emailSchema,
});

export const forgotSchema = z.object({
  email: emailSchema,
});

export const resetSchema = z.object({
  email: emailSchema,
  code: verificationCodeSchema,
  newPassword: passwordSchema,
});

/* ---------------- profile ---------------- */

export const profileUpdateSchema = z
  .object({
    nickname: nicknameSchema.optional(),
    avatarKey: avatarKeySchema.nullable().optional(),
    ageRange: z.string().min(1).optional(),
    timezone: z.string().trim().min(1).max(64).optional(),
    persona: z.string().trim().max(60).nullable().optional(),
    skillLevel: skillLevelSchema.optional(),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), {
    error: "Provide at least one field to update.",
  });

export const onboardingSchema = z.object({
  avatarKey: avatarKeySchema,
  categoryIds: categoryIdsSchema,
});

export const categorySelectionSchema = z.object({
  categoryIds: categoryIdsSchema,
});

/* ---------------- organisation ---------------- */

export const visibilitySchema = z.object({
  visible: z.boolean(),
});

export const joinCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(4, "Enter your join code.")
    .max(32, "That join code is too long."),
});

export const createJoinCodeSchema = z.object({
  orgId: z.uuid("Choose an organisation."),
  label: z.string().trim().max(80).optional(),
  maxUses: z.number().int().min(1).max(10_000).nullable().optional(),
  expiresAt: z
    .string()
    .trim()
    .refine((v) => !Number.isNaN(Date.parse(v)), { error: "Enter a valid expiry date." })
    .nullable()
    .optional(),
});

/* ---------------- pagination ---------------- */

export const pageQuerySchema = z.object({
  cursor: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
