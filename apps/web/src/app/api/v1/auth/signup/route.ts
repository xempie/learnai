import { NextResponse, type NextRequest } from "next/server";
import { authProvider } from "@/lib/auth/provider";
import { ApiError, errorResponse } from "@/lib/http/api-error";
import { rateLimit } from "@/lib/http/rate-limit";

interface SignupRequestBody {
  email?: unknown;
  password?: unknown;
}

/**
 * POST /api/v1/auth/signup — LEARN_AI_V1_BUILD_SPEC.md §8.
 *
 * Creates a `users` row (via `AuthProvider.signUp`, which uses
 * packages/db's shared pool) and triggers verification-email delivery.
 * §4.1 cohort assignment (T05) runs synchronously inside `signUp` before
 * the row is inserted — see `packages/db/src/cohort-assignment.ts` and the
 * comment in `lib/auth/provider.ts`. A disposable-domain email surfaces
 * here as a 422 `DISPOSABLE_EMAIL` `ApiError`, same as any other signup
 * validation failure.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    rateLimit(req, "auth:signup", 10, 60_000);

    let body: SignupRequestBody;
    try {
      body = (await req.json()) as SignupRequestBody;
    } catch {
      throw new ApiError(422, "INVALID_BODY", "Request body must be valid JSON.");
    }

    if (typeof body.email !== "string" || body.email.length === 0) {
      throw new ApiError(422, "INVALID_BODY", "email is required.", { field: "email" });
    }
    if (body.password !== undefined && typeof body.password !== "string") {
      throw new ApiError(422, "INVALID_BODY", "password must be a string.", { field: "password" });
    }

    const { userId } = await authProvider.signUp(body.email, body.password);
    await authProvider.sendVerification(userId);

    return NextResponse.json({ userId }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
