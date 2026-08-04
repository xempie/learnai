import "server-only";

import { type SQL, and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { config } from "@/lib/config";

/**
 * The single place cohort visibility is enforced (TECHNICAL_SPEC §7.2,
 * V1_BUILD_SPEC §5.1).
 *
 * NEVER write `where org_visible = true` anywhere else. Every query that can
 * return another member goes through `visibleMemberFilter()`; every count goes
 * through `cohortCount()`. Tests assert no path returns a non-opted-in user.
 */

/** Rows for members who have opted in and are still active. */
export function visibleMemberFilter(orgId: string): SQL {
  return and(
    eq(users.orgId, orgId),
    eq(users.orgVisible, true),
    eq(users.isSuspended, false),
    isNull(users.deletedAt),
  )!;
}

export interface CohortCount {
  /** Total active members, opted in or not. */
  total: number;
  /** True when the count is below the display threshold and must be hidden. */
  suppressed: boolean;
  /** What the UI should show: the number, or null when suppressed. */
  displayCount: number | null;
}

/**
 * Aggregate member count. Suppressed below MIN_COHORT_DISPLAY because with two
 * members, "2 people" plus one known colleague identifies someone.
 */
export async function cohortCount(orgId: string | null): Promise<CohortCount> {
  if (!orgId) return { total: 0, suppressed: true, displayCount: null };

  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(and(eq(users.orgId, orgId), eq(users.isSuspended, false), isNull(users.deletedAt)));

  const total = row?.count ?? 0;
  const suppressed = total < config.limits.minCohortDisplay;
  return { total, suppressed, displayCount: suppressed ? null : total };
}

/** Opted-in members only, for the member list and leaderboards. */
export async function visibleMembers(
  orgId: string,
  opts: { limit?: number; offset?: number } = {},
) {
  return db
    .select({
      id: users.id,
      nickname: users.nickname,
      avatarKey: users.avatarKey,
      isFoundingMember: users.isFoundingMember,
    })
    .from(users)
    .where(visibleMemberFilter(orgId))
    .limit(Math.min(opts.limit ?? 20, 100))
    .offset(opts.offset ?? 0);
}

/**
 * Re-filters a stored leaderboard snapshot against current visibility so an
 * opt-out takes effect immediately rather than at the next snapshot.
 */
export async function filterSnapshotEntries<T extends { user_id: string }>(
  entries: T[],
): Promise<T[]> {
  if (entries.length === 0) return [];
  const ids = entries.map((e) => e.user_id);

  const stillVisible = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        sql`${users.id} = any(${ids})`,
        eq(users.orgVisible, true),
        eq(users.isSuspended, false),
        isNull(users.deletedAt),
      ),
    );

  const allowed = new Set(stillVisible.map((r) => r.id));
  return entries.filter((e) => allowed.has(e.user_id));
}
