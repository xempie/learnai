import { type SQL, and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { decodeCursor, encodeCursor, handler, ok, parseQuery } from "@/lib/api";
import { requireAuth } from "@/lib/auth/session";
import { unreadCount } from "@/lib/notifications";
import {
  type TimeCursor,
  notificationsQuerySchema,
  serialiseNotification,
} from "@/lib/schemas/engagement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/notifications - newest first, always scoped to the caller.
 * The unread badge count rides along so the bell doesn't need a second request.
 */
export const GET = handler(async (req: Request) => {
  const user = await requireAuth();
  const q = parseQuery(req, notificationsQuerySchema);

  const where: SQL[] = [eq(notifications.userId, user.id)];
  if (q.unread_only) where.push(isNull(notifications.readAt));

  const cursor = decodeCursor<TimeCursor>(q.cursor ?? null);
  if (cursor) {
    where.push(
      sql`(${notifications.createdAt}, ${notifications.id}) < (${cursor.t}::timestamptz, ${cursor.id}::uuid)`,
    );
  }

  const rows = await db
    .select()
    .from(notifications)
    .where(and(...where))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(q.limit);

  const last = rows[rows.length - 1];
  return ok({
    data: rows.map(serialiseNotification),
    next_cursor:
      rows.length === q.limit && last
        ? encodeCursor({ t: last.createdAt.toISOString(), id: last.id })
        : null,
    unread: await unreadCount(user.id),
  });
});
