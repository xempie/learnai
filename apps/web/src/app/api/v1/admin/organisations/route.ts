import { NextResponse, type NextRequest } from "next/server";
import { getPool } from "@learn-ai/db";
import { authProvider } from "@/lib/auth/provider";
import { errorResponse } from "@/lib/http/api-error";

/**
 * GET /api/v1/admin/organisations — LEARN_AI_V1_BUILD_SPEC.md §4.1 (last
 * line: "Auto-created organisations with derived names are flagged
 * `auto_created = true` and surfaced in an admin queue for Vala to
 * rename") and §12 T06 acceptance.
 *
 * `role: admin` only (`requireRole` throws 403 otherwise — including for
 * `reviewer`, which is a distinct, lower-ranked role).
 *
 * `?auto_created=true|false` filters; omitted returns every organisation.
 * V1's only real caller is `/admin/organisations` asking for
 * `auto_created=true` (the rename queue), but the filter is generic rather
 * than hardcoding the one value the UI happens to use today.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await authProvider.requireRole(req, "admin");

    const { searchParams } = new URL(req.url);
    const autoCreatedParam = searchParams.get("auto_created");

    const pool = getPool();
    const conditions: string[] = [];
    const values: unknown[] = [];
    if (autoCreatedParam !== null) {
      conditions.push(`auto_created = $${String(values.length + 1)}`);
      values.push(autoCreatedParam === "true");
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows } = await pool.query<{
      id: string;
      name: string;
      slug: string;
      primary_domain: string;
      kind: string | null;
      member_count: number;
      auto_created: boolean;
      created_at: string;
    }>(
      `SELECT id, name, slug, primary_domain, kind, member_count, auto_created, created_at
         FROM organisations
         ${where}
         ORDER BY created_at DESC`,
      values,
    );

    return NextResponse.json({
      organisations: rows.map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        primaryDomain: row.primary_domain,
        kind: row.kind,
        memberCount: row.member_count,
        autoCreated: row.auto_created,
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
