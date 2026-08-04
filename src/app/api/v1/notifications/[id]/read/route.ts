import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { ApiError, handler, ok } from "@/lib/api";
import { requireAuth } from "@/lib/auth/session";
import { unreadCount } from "@/lib/notifications";
import { requireUuidParam } from "@/lib/schemas/engagement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/notifications/:id/read
 *
 * The `user_id` predicate is part of the UPDATE, not a separate check - there is
 * no window in which another user's notification could be touched.
 */
export const POST = handler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params;
    const notificationId = requireUuidParam(id, "notification");
    const user = await requireAuth();

    const updated = await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notifications.id, notificationId),
          eq(notifications.userId, user.id),
          isNull(notifications.readAt),
        ),
      )
      .returning({ id: notifications.id });

    if (updated.length === 0) {
      // Either it isn't theirs, doesn't exist, or was already read. Distinguish
      // the last case so a double-tap isn't reported as an error.
      const exists = await db.query.notifications.findFirst({
        where: and(eq(notifications.id, notificationId), eq(notifications.userId, user.id)),
        columns: { id: true },
      });
      if (!exists) throw new ApiError("NOT_FOUND", "That notification does not exist.");
    }

    return ok({ read: true, unread: await unreadCount(user.id) });
  },
);
