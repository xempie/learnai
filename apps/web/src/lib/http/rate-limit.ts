import type { NextRequest } from "next/server";
import { ApiError } from "./api-error";

/**
 * Simple in-process fixed-window rate limiter.
 *
 * LIMITATION (noted per T03 instructions): this state lives in the Node
 * process's memory. It works for a single instance (local dev, one Lambda
 * container that stays warm) but does NOT coordinate across multiple
 * concurrent instances — on Amplify/Lambda with several warm containers,
 * each has its own counter, so the effective limit is `limit * instanceCount`.
 * A production-correctness fix would move this to a shared store (e.g.
 * DynamoDB or Redis/ElastiCache) — out of scope for T03.
 */
const windows = new Map<string, { count: number; windowStart: number }>();

export function rateLimit(req: NextRequest, key: string, limit: number, windowMs: number): void {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  const bucketKey = `${key}:${ip}`;
  const now = Date.now();
  const bucket = windows.get(bucketKey);

  if (!bucket || now - bucket.windowStart >= windowMs) {
    windows.set(bucketKey, { count: 1, windowStart: now });
    return;
  }

  bucket.count += 1;
  if (bucket.count > limit) {
    throw new ApiError(429, "RATE_LIMITED", "Too many requests. Please try again shortly.");
  }
}
