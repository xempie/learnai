import { eq } from "drizzle-orm";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { ApiError, clientIp, handler, ok, parseBody } from "@/lib/api";
import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth/session";
import { serialiseLead } from "@/lib/leads-serialise";
import { leadPatchSchema } from "@/lib/schemas/leads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/v1/admin/leads/[id]
 *
 * Status and/or notes only. The first transition to 'qualified' stamps
 * qualified_at once; later status changes never move it (first-stamp-wins),
 * so it stays a reliable "date this lead first qualified" for the metrics route.
 */
export const PATCH = handler(async (req: Request, ctx: Ctx) => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const body = await parseBody(req, leadPatchSchema);

  const existing = await db.query.leads.findFirst({ where: eq(leads.id, id) });
  if (!existing) throw new ApiError("NOT_FOUND", "Lead not found.");

  const [updated] = await db
    .update(leads)
    .set({
      ...(body.status ? { status: body.status } : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
      ...(body.status === "qualified" && !existing.qualifiedAt
        ? { qualifiedAt: new Date() }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(leads.id, id))
    .returning();
  if (!updated) throw new ApiError("NOT_FOUND", "Lead not found.");

  await audit({
    actorId: admin.id,
    action: "lead.updated",
    entityType: "lead",
    entityId: id,
    metadata: { status: body.status ?? existing.status },
    ipAddress: clientIp(req),
  });

  return ok(serialiseLead(updated));
});
