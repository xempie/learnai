/**
 * GET /api/v1/admin/leads
 * Admin services-funnel queue, newest first, keyset paginated on
 * (created_at, id) - same pattern as GET /api/v1/topics.
 */

import { and, desc, eq, lt, or } from "drizzle-orm";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { type Page, decodeCursor, encodeCursor, handler, ok, parseQuery } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { serialiseLead, type SerialisedLead } from "@/lib/leads-serialise";
import { adminLeadListQuery } from "@/lib/schemas/leads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface LeadCursor {
  c: string;
  i: string;
}

export const GET = handler(async (req: Request) => {
  await requireAdmin();
  const q = parseQuery(req, adminLeadListQuery);
  const cursor = decodeCursor<LeadCursor>(q.cursor ?? null);

  const filters = [];
  if (q.status) filters.push(eq(leads.status, q.status));

  if (cursor) {
    const at = new Date(cursor.c);
    const keyset = or(
      lt(leads.createdAt, at),
      and(eq(leads.createdAt, at), lt(leads.id, cursor.i)),
    );
    if (keyset) filters.push(keyset);
  }

  const rows = await db
    .select()
    .from(leads)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(leads.createdAt), desc(leads.id))
    .limit(q.limit + 1);

  const hasMore = rows.length > q.limit;
  const page = hasMore ? rows.slice(0, q.limit) : rows;
  const last = page[page.length - 1];

  const body: Page<SerialisedLead> = {
    data: page.map(serialiseLead),
    next_cursor:
      hasMore && last ? encodeCursor({ c: last.createdAt.toISOString(), i: last.id }) : null,
  };

  return ok(body);
});
