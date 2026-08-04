import { clientIp, handler, noContent } from "@/lib/api";
import { audit } from "@/lib/audit";
import { destroySession, getCurrentUser } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/auth/logout
 *
 * Idempotent: signing out when already signed out is a 204, not an error.
 */
export const POST = handler(async (req: Request) => {
  const user = await getCurrentUser();

  await destroySession();

  if (user) {
    await audit({
      actorId: user.id,
      action: "user.logout",
      entityType: "user",
      entityId: user.id,
      ipAddress: clientIp(req),
    });
  }

  return noContent();
});
