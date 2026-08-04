import { sql } from "drizzle-orm";
import { db } from "@/db";

/**
 * Liveness/readiness probe for the load balancer.
 *
 * It touches the database on purpose. An instance that cannot reach Postgres
 * can serve nothing useful, so reporting it healthy would just route traffic
 * to a container that 500s on every page.
 *
 * Deliberately says nothing about versions, hostnames or error details - this
 * endpoint is unauthenticated.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(): Promise<Response> {
  try {
    await db.execute(sql`select 1`);
  } catch {
    return Response.json({ status: "unhealthy" }, { status: 503 });
  }
  return Response.json({ status: "ok" });
}
