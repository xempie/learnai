import { NextResponse, type NextRequest } from "next/server";
import { verifyEmailToken } from "@/lib/auth/provider";
import { ApiError, errorResponse } from "@/lib/http/api-error";
import { rateLimit } from "@/lib/http/rate-limit";

interface VerifyRequestBody {
  token?: unknown;
}

/**
 * POST /api/v1/auth/verify — LEARN_AI_V1_BUILD_SPEC.md §8.
 * Flips `users.email_verified_at`. Also answers GET with `?token=` so the
 * link logged by the dev mailer (`lib/auth/mailer.ts`) is clickable.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    rateLimit(req, "auth:verify", 20, 60_000);

    let body: VerifyRequestBody;
    try {
      body = (await req.json()) as VerifyRequestBody;
    } catch {
      throw new ApiError(422, "INVALID_BODY", "Request body must be valid JSON.");
    }

    if (typeof body.token !== "string" || body.token.length === 0) {
      throw new ApiError(422, "INVALID_BODY", "token is required.", { field: "token" });
    }

    const { userId } = await verifyEmailToken(body.token);
    return NextResponse.json({ userId, verified: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    rateLimit(req, "auth:verify", 20, 60_000);

    const token = req.nextUrl.searchParams.get("token");
    if (!token) {
      throw new ApiError(422, "INVALID_BODY", "token query parameter is required.", {
        field: "token",
      });
    }

    const { userId } = await verifyEmailToken(token);
    return NextResponse.json({ userId, verified: true });
  } catch (error) {
    return errorResponse(error);
  }
}
