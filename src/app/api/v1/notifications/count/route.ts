import { handler, ok } from "@/lib/api";
import { requireAuth } from "@/lib/auth/session";
import { unreadCount } from "@/lib/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/notifications/count
 * Polled by the bell badge, so it stays a single indexed COUNT and nothing else.
 */
export const GET = handler(async () => {
  const user = await requireAuth();
  return ok({ unread: await unreadCount(user.id) });
});
