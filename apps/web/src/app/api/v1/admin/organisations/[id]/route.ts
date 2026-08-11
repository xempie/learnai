import { NextResponse, type NextRequest } from "next/server";
import { getPool, slugify, type Pool } from "@learn-ai/db";
import { authProvider } from "@/lib/auth/provider";
import { ApiError, errorResponse } from "@/lib/http/api-error";

/**
 * PATCH /api/v1/admin/organisations/:id — LEARN_AI_V1_BUILD_SPEC.md §4.1
 * admin rename queue, §12 T06 acceptance ("PATCH /api/v1/admin/organisations/[id]
 * {name} (re-slugs safely)").
 *
 * `role: admin` only. Renaming re-derives the slug from the new name via
 * the same `slugify` used at signup time (§4.1's "slug = slugify(name),
 * deduplicated") so a renamed organisation's URL always matches its
 * current display name. On a slug collision with a *different*
 * organisation, a numeric suffix is appended and retried — the same
 * dedupe strategy `packages/db/src/cohort-assignment.ts` uses for new
 * organisations.
 */

interface UpdateBody {
  name?: unknown;
}

const MAX_SLUG_ATTEMPTS = 25;
const PG_UNIQUE_VIOLATION = "23505";

function isSlugConflict(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { code?: string; constraint?: string };
  return err.code === PG_UNIQUE_VIOLATION && err.constraint === "organisations_slug_key";
}

/** Renames `id` and re-slugs it safely. Returns `null` if no such organisation exists. */
async function renameOrganisation(
  pool: Pool,
  id: string,
  name: string,
): Promise<{ name: string; slug: string } | null> {
  const baseSlug = slugify(name);

  for (let attempt = 1; attempt <= MAX_SLUG_ATTEMPTS; attempt += 1) {
    const candidateSlug = attempt === 1 ? baseSlug : `${baseSlug}-${String(attempt)}`;
    try {
      const { rows } = await pool.query<{ name: string; slug: string }>(
        `UPDATE organisations SET name = $1, slug = $2 WHERE id = $3 RETURNING name, slug`,
        [name, candidateSlug, id],
      );
      const updated = rows[0];
      if (updated) {
        return updated;
      }
      // WHERE id = $3 matched nothing (no such organisation) — not a slug
      // conflict, stop retrying and let the caller 404.
      return null;
    } catch (error) {
      if (isSlugConflict(error)) {
        // A different organisation already has this slug — try the next
        // dedupe suffix, same strategy as cohort-assignment.ts's
        // insertOrganisation.
        continue;
      }
      throw error;
    }
  }

  throw new Error(
    `Could not allocate a unique slug for organisation rename "${name}" after ${String(MAX_SLUG_ATTEMPTS)} attempts.`,
  );
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    await authProvider.requireRole(req, "admin");
    const { id } = await params;

    let body: UpdateBody;
    try {
      body = (await req.json()) as UpdateBody;
    } catch {
      throw new ApiError(422, "INVALID_BODY", "Request body must be valid JSON.");
    }
    if (typeof body.name !== "string" || body.name.trim().length === 0) {
      throw new ApiError(422, "INVALID_BODY", "name is required.", { field: "name" });
    }

    const renamed = await renameOrganisation(getPool(), id, body.name.trim());
    if (!renamed) {
      throw new ApiError(404, "ORGANISATION_NOT_FOUND", "No such organisation.");
    }

    return NextResponse.json({ id, name: renamed.name, slug: renamed.slug });
  } catch (error) {
    return errorResponse(error);
  }
}
