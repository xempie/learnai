import { NextResponse, type NextRequest } from "next/server";
import { getPool, newId } from "@learn-ai/db";
import { authProvider } from "@/lib/auth/provider";
import { ApiError, errorResponse } from "@/lib/http/api-error";
import { rateLimit } from "@/lib/http/rate-limit";

/**
 * POST /api/v1/org/:slug/claim — LEARN_AI_V1_BUILD_SPEC.md §4.2 / §8.
 *
 * Requires a verified member of the organisation (same guard as
 * `GET /api/v1/org/:slug` — 403 for non-members). Inserts a `pending`
 * `organisation_claims` row when `organisations.claimed_by IS NULL`.
 * 409s (no row inserted) when:
 *  - the organisation is already claimed by anyone (`claimed_by IS NOT NULL`), or
 *  - this same user already has a pending claim on this organisation.
 *
 * Resolving a claim (approving it, setting `organisations.claimed_by`) is
 * an admin action out of scope for T06 — only the request side of the flow
 * is specified in §4.2/§8.
 */

interface OrganisationRow {
  id: string;
  claimed_by: string | null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  try {
    const user = await authProvider.requireUser(req);
    rateLimit(req, "org:claim", 10, 60_000);

    const { slug } = await params;
    const pool = getPool();

    const { rows: orgRows } = await pool.query<OrganisationRow>(
      `SELECT id, claimed_by FROM organisations WHERE slug = $1`,
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

    if (org.claimed_by !== null) {
      throw new ApiError(
        409,
        "ORGANISATION_ALREADY_CLAIMED",
        "This organisation has already been claimed.",
      );
    }

    const { rows: pendingRows } = await pool.query<{ id: string }>(
      `SELECT id FROM organisation_claims
         WHERE organisation_id = $1 AND user_id = $2 AND status = 'pending'`,
      [org.id, user.id],
    );
    if (pendingRows[0]) {
      throw new ApiError(
        409,
        "CLAIM_ALREADY_PENDING",
        "You already have a pending claim for this organisation.",
      );
    }

    const claimId = newId();
    await pool.query(
      `INSERT INTO organisation_claims (id, organisation_id, user_id, status)
         VALUES ($1, $2, $3, 'pending')`,
      [claimId, org.id, user.id],
    );

    return NextResponse.json({ id: claimId, status: "pending" }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
