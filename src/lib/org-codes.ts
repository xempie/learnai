import "server-only";

import { randomInt } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  orgJoinCodeRedemptions,
  orgJoinCodes,
  organizations,
  users,
} from "@/db/schema";
import { ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { isWithinFoundingLimit } from "@/lib/domain-matching";

/**
 * Organisation join codes (TECHNICAL_SPEC §7.1 escape hatch).
 *
 * Domain matching covers people whose work email is recognised. Codes cover
 * everyone else - contractors, BYO-device staff, personal addresses - without
 * letting anyone into a cohort they were not invited to.
 *
 * Codes are read aloud and typed by hand, so the alphabet drops every glyph pair
 * that is confusable in a sans-serif font: O/0 and I/1 are all absent.
 */

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const SUFFIX_LENGTH = 4;
const PREFIX_LENGTH = 4;
const MAX_ATTEMPTS = 25;

function randomChar(): string {
  return ALPHABET[randomInt(ALPHABET.length)]!;
}

function randomBlock(length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) out += randomChar();
  return out;
}

/** "adelaide-university" -> "ADEL". Padded with random characters if too short. */
export function joinCodePrefix(orgSlug: string): string {
  const usable = orgSlug
    .toUpperCase()
    .split("")
    .filter((c) => ALPHABET.includes(c));

  let prefix = usable.slice(0, PREFIX_LENGTH).join("");
  while (prefix.length < PREFIX_LENGTH) prefix += randomChar();
  return prefix;
}

/** Strips formatting so "adel 7k2p" and "ADEL-7K2P" are the same code. */
export function normaliseJoinCode(input: string): string {
  const cleaned = input
    .toUpperCase()
    .split("")
    .filter((c) => ALPHABET.includes(c))
    .join("");
  if (cleaned.length <= PREFIX_LENGTH) return cleaned;
  return `${cleaned.slice(0, PREFIX_LENGTH)}-${cleaned.slice(PREFIX_LENGTH)}`;
}

/**
 * A readable, platform-unique code such as `ADEL-7K2P`. Retries on collision -
 * the code column is unique, so a duplicate would otherwise surface as a 500.
 */
export async function generateJoinCode(orgSlug: string): Promise<string> {
  const prefix = joinCodePrefix(orgSlug);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    // Widen the random block if the namespace starts to feel crowded.
    const suffixLength = SUFFIX_LENGTH + Math.floor(attempt / 10);
    const code = `${prefix}-${randomBlock(suffixLength)}`;

    const existing = await db.query.orgJoinCodes.findFirst({
      where: eq(orgJoinCodes.code, code),
      columns: { id: true },
    });
    if (!existing) return code;
  }

  throw new ApiError("SERVER_ERROR", "Could not generate a join code. Please try again.");
}

export interface RedeemedOrganisation {
  id: string;
  name: string;
  type: string;
  isFoundingMember: boolean;
}

/**
 * Redeems a join code for a user. Every check runs inside one transaction so two
 * simultaneous redemptions cannot push `usedCount` past `maxUses`.
 */
export async function redeemJoinCode(
  userId: string,
  rawCode: string,
  opts: { ipAddress?: string | null } = {},
): Promise<RedeemedOrganisation> {
  const code = normaliseJoinCode(rawCode);
  if (code.length < 4) {
    throw new ApiError("VALIDATION_FAILED", "Enter a valid join code.", {
      code: "Enter a valid join code.",
    });
  }

  const result = await db.transaction(async (tx) => {
    const joinCode = await tx.query.orgJoinCodes.findFirst({
      where: eq(orgJoinCodes.code, code),
    });
    if (!joinCode) {
      throw new ApiError("NOT_FOUND", "That join code is not valid.");
    }
    if (!joinCode.isActive) {
      throw new ApiError("FORBIDDEN", "That join code is no longer active.");
    }
    if (joinCode.expiresAt && joinCode.expiresAt.getTime() <= Date.now()) {
      throw new ApiError("FORBIDDEN", "That join code has expired.");
    }
    if (joinCode.maxUses !== null && joinCode.usedCount >= joinCode.maxUses) {
      throw new ApiError("FORBIDDEN", "That join code has reached its limit.");
    }

    const user = await tx.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { id: true, orgId: true, isFoundingMember: true, deletedAt: true },
    });
    if (!user || user.deletedAt) {
      throw new ApiError("NOT_FOUND", "Account not found.");
    }
    if (user.orgId && user.orgId !== joinCode.orgId) {
      throw new ApiError(
        "CONFLICT",
        "You already belong to an organisation. Leave it before joining another.",
      );
    }

    const alreadyRedeemed = await tx.query.orgJoinCodeRedemptions.findFirst({
      where: and(
        eq(orgJoinCodeRedemptions.codeId, joinCode.id),
        eq(orgJoinCodeRedemptions.userId, userId),
      ),
      columns: { id: true },
    });
    if (alreadyRedeemed) {
      throw new ApiError("CONFLICT", "You have already used that join code.");
    }

    const org = await tx.query.organizations.findFirst({
      where: eq(organizations.id, joinCode.orgId),
      columns: { id: true, name: true, type: true },
    });
    if (!org) {
      throw new ApiError("NOT_FOUND", "That organisation no longer exists.");
    }

    // Claim a use first: the conditional WHERE makes the seat check atomic.
    const claimed = await tx
      .update(orgJoinCodes)
      .set({
        usedCount: sql`${orgJoinCodes.usedCount} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(orgJoinCodes.id, joinCode.id),
          eq(orgJoinCodes.isActive, true),
          sql`(${orgJoinCodes.maxUses} is null or ${orgJoinCodes.usedCount} < ${orgJoinCodes.maxUses})`,
        ),
      )
      .returning({ id: orgJoinCodes.id });

    if (claimed.length === 0) {
      throw new ApiError("FORBIDDEN", "That join code has reached its limit.");
    }

    const isFoundingMember = user.orgId
      ? user.isFoundingMember
      : await isWithinFoundingLimit(joinCode.orgId);

    await tx
      .update(users)
      .set({ orgId: joinCode.orgId, isFoundingMember, updatedAt: new Date() })
      .where(eq(users.id, userId));

    await tx.insert(orgJoinCodeRedemptions).values({
      codeId: joinCode.id,
      userId,
    });

    return {
      codeId: joinCode.id,
      organisation: {
        id: org.id,
        name: org.name,
        type: org.type,
        isFoundingMember,
      } satisfies RedeemedOrganisation,
    };
  });

  await audit({
    actorId: userId,
    action: "org.join_code_redeemed",
    entityType: "organization",
    entityId: result.organisation.id,
    metadata: { codeId: result.codeId, isFoundingMember: result.organisation.isFoundingMember },
    ipAddress: opts.ipAddress ?? null,
  });

  return result.organisation;
}
