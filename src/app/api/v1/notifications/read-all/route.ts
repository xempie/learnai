import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { handler, ok } from "@/lib/api";
import { requireAuth } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/v1/notifications/read-all - clears the caller's badge. */
export const POST = handler(async () => {
  const user = await requireAuth();

  const updated = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)))
    .returning({ id: notifications.id });

  return ok({ marked_read: updated.length, unread: 0 });
});
