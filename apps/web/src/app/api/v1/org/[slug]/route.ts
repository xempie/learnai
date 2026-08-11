import { NextResponse, type NextRequest } from "next/server";
import { getPool } from "@learn-ai/db";
import { authProvider } from "@/lib/auth/provider";
import { ApiError, errorResponse } from "@/lib/http/api-error";

/**
 * GET /api/v1/org/:slug — LEARN_AI_V1_BUILD_SPEC.md §4.2 / §8.
 *
 * Visible to any authenticated (and verified — `requireUser` enforces
 * this) member of the organisation identified by `slug`. Every other
 * signed-in user gets 403 `FORBIDDEN` — organisation cohort data never
 * crosses org boundaries.
 *
 * PRIVACY (§4.2, NON-NEGOTIABLE):
 *  - No email addresses anywhere in this payload — the query below never
 *    selects `users.email`, only `display_name` and `streaks.current_streak`.
 *  - Members with `show_in_cohort = false` (T06 migration, see
 *    1755200000000_add-show-in-cohort.js) are excluded from the colleague
 *    list entirely.
 *  - "Aggregate counts must suppress when member_count < 3 (avoid
 *    deanonymisation in tiny orgs)": when the organisation has fewer than
 *    3 members, `colleagueCount`, `colleagues`, and `aggregates` are all
 *    nulled/emptied and `suppressed: true` is returned instead — a 2-member
 *    org's "colleague activity" would otherwise trivially identify a named
 *    individual by their streak, which is exactly the deanonymisation risk
 *    the spec calls out.
 *  - "briefs completed this week" is a real (if currently always-zero,
 *    `completions` being empty until T15/T20) aggregate query.
 *    "most-read vertical" has no read-tracking source yet at T06, so it is
 *    always `null` — matches the controller brief's "null for now".
 */

interface OrganisationRow {
  id: string;
  name: string;
  slug: string;
  member_count: number;
  claimed_by: string | null;
}

interface ColleagueRow {
  display_name: string | null;
  current_streak: number | null;
}

const SUPPRESSION_THRESHOLD = 3;
const COLLEAGUE_LIST_LIMIT = 20;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  try {
    const user = await authProvider.requireUser(req);
    const { slug } = await params;
    const pool = getPool();

    const { rows: orgRows } = await pool.query<OrganisationRow>(
      `SELECT id, name, slug, member_count, claimed_by FROM organisations WHERE slug = $1`,
      [slug],
    );
    const org = orgRows[0];
    if (!org) {
      throw new ApiError(404, "ORGANISATION_NOT_FOUND", "No such organisation.");
    }

    const { rows: membershipRows } = await pool.query<{ organisation_id: string | null }>(
      `SELECT organisation_id FROM users WHERE id = $1`,
      [user.id],
    );
    const membership = membershipRows[0];
    if (!membership || membership.organisation_id !== org.id) {
      throw new ApiError(403, "FORBIDDEN", "You are not a member of this organisation.");
    }

    const suppressed = org.member_count < SUPPRESSION_THRESHOLD;

    let colleagueCount: number | null = null;
    let colleagues: { displayName: string; currentStreak: number }[] = [];
    let aggregates: { briefsCompletedThisWeek: number; mostReadVertical: string | null } | null =
      null;

    if (!suppressed) {
      colleagueCount = Math.max(org.member_count - 1, 0);

      const { rows: colleagueRows } = await pool.query<ColleagueRow>(
        `SELECT COALESCE(u.display_name, 'Member') AS display_name,
                COALESCE(s.current_streak, 0) AS current_streak
           FROM users u
           LEFT JOIN streaks s ON s.user_id = u.id
          WHERE u.organisation_id = $1
            AND u.id <> $2
            AND u.deleted_at IS NULL
            AND u.show_in_cohort = TRUE
          ORDER BY u.created_at DESC
          LIMIT ${COLLEAGUE_LIST_LIMIT}`,
        [org.id, user.id],
      );
      colleagues = colleagueRows.map((row) => ({
        displayName: row.display_name ?? "Member",
        currentStreak: Number(row.current_streak ?? 0),
      }));

      const { rows: briefRows } = await pool.query<{ count: number }>(
        `SELECT count(*)::int AS count
           FROM completions c
           JOIN users u ON u.id = c.user_id
          WHERE u.organisation_id = $1
            AND c.completed_at >= date_trunc('week', now())`,
        [org.id],
      );
      aggregates = {
        briefsCompletedThisWeek: Number(briefRows[0]?.count ?? 0),
        // No read-tracking source exists yet at T06 (see file header).
        mostReadVertical: null,
      };
    }

    return NextResponse.json({
      organisation: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        memberCount: org.member_count,
      },
      colleagueCount,
      suppressed,
      colleagues,
      aggregates,
      // §4.2: "'Claim this cohort' CTA for users whose email domain
      // matches and where claimed_by IS NULL". Domain match is implied —
      // only members of this exact organisation reach this point.
      claimEligible: org.claimed_by === null,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
