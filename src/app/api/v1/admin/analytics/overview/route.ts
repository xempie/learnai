import { overview } from "@/db/queries/analytics";
import { handler, ok, parseQuery } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { dateRangeSchema, resolveRange } from "@/lib/schemas/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/admin/analytics/overview?from=&to= - headline platform numbers. */
export const GET = handler(async (req: Request) => {
  await requireAdmin();
  const range = resolveRange(parseQuery(req, dateRangeSchema));
  const data = await overview(range);

  return ok({
    range: { from: range.from.toISOString(), to: range.to.toISOString() },
    ...data,
  });
});
