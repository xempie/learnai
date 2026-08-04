import { and, desc, eq, isNotNull, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { comments, organizations, users } from "@/db/schema";
import { handler, ok, parseQuery } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { adminUserListSchema } from "@/lib/schemas/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/admin/users?q=&org_id=&status=
 *
 * Account administration only: who they are, when they joined, when they were
 * last active, how many comments they've left, whether they're suspended and
 * which organisation they belong to.
 *
 * DELIBERATELY ABSENT: individual viewing history. Admins can see what content
 * performs (see /admin/analytics/*) but never what a named person watched. That
 * capability is not built here and must not be added - it is the difference
 * between running a platform and surveilling its members (TECHNICAL_SPEC §7.2).
 */
export const GET = handler(async (req: Request) => {
  await requireAdmin();
  const query = parseQuery(req, adminUserListSchema);

  const search = query.q?.toLowerCase();
  const filters = [
    search
      ? or(
          sql`lower(${users.email}) like ${`%${search}%`}`,
          sql`lower(${users.nickname}) like ${`%${search}%`}`,
        )
      : undefined,
    query.org_id ? eq(users.orgId, query.org_id) : undefined,
    query.status === "suspended" ? eq(users.isSuspended, true) : undefined,
    query.status === "active"
      ? and(eq(users.isSuspended, false), isNull(users.deletedAt))
      : undefined,
    query.status === "unverified" ? eq(users.emailVerified, false) : undefined,
    query.status === "deleted" ? isNotNull(users.deletedAt) : undefined,
    // Deleted accounts are hidden unless explicitly asked for.
    query.status === "deleted" ? undefined : isNull(users.deletedAt),
  ].filter(Boolean);

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      nickname: users.nickname,
      role: users.role,
      emailVerified: users.emailVerified,
      isSuspended: users.isSuspended,
      createdAt: users.createdAt,
      lastActiveAt: users.lastActiveAt,
      deletedAt: users.deletedAt,
      orgId: users.orgId,
      orgName: organizations.name,
      commentCount: sql<number>`(
        select count(*)::int from ${comments}
        where ${comments.userId} = ${users.id} and ${comments.status} <> 'deleted'
      )`,
    })
    .from(users)
    .leftJoin(organizations, eq(organizations.id, users.orgId))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(users.createdAt))
    .limit(query.limit)
    .offset(query.offset);

  return ok({
    data: rows.map((r) => ({
      id: r.id,
      email: r.email,
      nickname: r.nickname,
      role: r.role,
      email_verified: r.emailVerified,
      is_suspended: r.isSuspended,
      registered_at: r.createdAt.toISOString(),
      last_active_at: r.lastActiveAt?.toISOString() ?? null,
      deleted_at: r.deletedAt?.toISOString() ?? null,
      comment_count: Number(r.commentCount),
      organization: r.orgId ? { id: r.orgId, name: r.orgName } : null,
    })),
  });
});
