import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { orgJoinCodes, organizations } from "@/db/schema";
import {
  ApiError,
  clientIp,
  decodeCursor,
  encodeCursor,
  handler,
  ok,
  parseBody,
  parseQuery,
} from "@/lib/api";
import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth/session";
import { generateJoinCode } from "@/lib/org-codes";
import { createJoinCodeSchema, pageQuerySchema } from "@/lib/schemas/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 50;

const listQuerySchema = pageQuerySchema.extend({
  org_id: z.uuid().optional(),
});

function serialise(row: typeof orgJoinCodes.$inferSelect) {
  return {
    id: row.id,
    org_id: row.orgId,
    code: row.code,
    label: row.label,
    max_uses: row.maxUses,
    used_count: row.usedCount,
    expires_at: row.expiresAt?.toISOString() ?? null,
    is_active: row.isActive,
    created_at: row.createdAt.toISOString(),
  };
}

/**
 * GET /api/v1/org/codes
 *
 * Admin only. A join code is a key to someone's cohort, so listing them is not
 * something an org member - or even an org admin in V1 - can do.
 */
export const GET = handler(async (req: Request) => {
  await requireAdmin();

  const query = parseQuery(req, listQuerySchema);
  const limit = query.limit ?? DEFAULT_LIMIT;
  const cursor = decodeCursor<{ offset?: number }>(query.cursor);
  const offset = Math.max(0, Number(cursor?.offset ?? 0));

  const rows = await db
    .select()
    .from(orgJoinCodes)
    .where(query.org_id ? eq(orgJoinCodes.orgId, query.org_id) : undefined)
    .orderBy(desc(orgJoinCodes.createdAt))
    .limit(limit)
    .offset(offset);

  return ok({
    data: rows.map(serialise),
    next_cursor: rows.length === limit ? encodeCursor({ offset: offset + limit }) : null,
  });
});

/** POST /api/v1/org/codes */
export const POST = handler(async (req: Request) => {
  const admin = await requireAdmin();
  const body = await parseBody(req, createJoinCodeSchema);

  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, body.orgId),
    columns: { id: true, slug: true },
  });
  if (!org) throw new ApiError("NOT_FOUND", "That organisation does not exist.");

  const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
  if (expiresAt && expiresAt.getTime() <= Date.now()) {
    throw new ApiError("VALIDATION_FAILED", "The expiry date must be in the future.", {
      expiresAt: "Choose a future date.",
    });
  }

  const code = await generateJoinCode(org.slug);

  const [row] = await db
    .insert(orgJoinCodes)
    .values({
      orgId: org.id,
      code,
      label: body.label ?? null,
      maxUses: body.maxUses ?? null,
      expiresAt,
      createdBy: admin.id,
    })
    .returning();

  await audit({
    actorId: admin.id,
    action: "org.join_code_created",
    entityType: "organization",
    entityId: org.id,
    metadata: { codeId: row!.id, maxUses: row!.maxUses },
    ipAddress: clientIp(req),
  });

  return ok(serialise(row!), 201);
});
