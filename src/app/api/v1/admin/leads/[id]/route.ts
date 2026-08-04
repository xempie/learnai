import { eq, sql } from "drizzle-orm";
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
 * qualified_at once; later status changes never move it (first-stamp-wins).
 * The stamp is set with a SQL-side `coalesce(qualified_at, now())` rather
 * than a JS-side `existing.qualifiedAt ? {} : { qualifiedAt: new Date() }`
 * conditional, so it stays correct under two near-simultaneous PATCHes to
 * 'qualified': whichever UPDATE commits first wins the timestamp, and the
 * second sees a non-null qualified_at already there and coalesces to it
 * instead of racing past it with its own now().
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
      ...(body.status === "qualified"
        ? { qualifiedAt: sql`coalesce(${leads.qualifiedAt}, now())` }
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
