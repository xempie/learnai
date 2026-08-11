import { NextResponse, type NextRequest } from "next/server";
import { getPool } from "@learn-ai/db";
import { authProvider } from "@/lib/auth/provider";
import { errorResponse } from "@/lib/http/api-error";

/**
 * GET /api/v1/me — LEARN_AI_V1_BUILD_SPEC.md §8.
 *
 * Placeholder profile skeleton proving the auth guards: `requireUser`
 * throws 401 for no session or an unverified email; the DB lookup below is
 * a plain profile-data fetch (not an auth concern), reusing packages/db's
 * shared pool — no second pg pool is created anywhere in this codebase.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const user = await authProvider.requireUser(req);

    const { rows } = await getPool().query<{ tier: string }>(
      `SELECT tier FROM users WHERE id = $1`,
      [user.id],
    );
    const tier = rows[0]?.tier ?? "free";

    return NextResponse.json({
      id: user.id,
      email: user.email,
      role: user.role,
      tier,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
