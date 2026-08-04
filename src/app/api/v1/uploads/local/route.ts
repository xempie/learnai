/**
 * POST /api/v1/uploads/local?key=...
 *
 * Dev-only stand-in for a presigned S3 PUT, so the whole upload flow works with
 * no AWS account. It is the ONE place a file body passes through the API; in
 * production `createUploadUrl()` returns an S3 URL and the browser uploads
 * directly, because a 500 MB body through Lambda is not a thing we do.
 */

import { ApiError, handler, ok } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { config } from "@/lib/config";
import { writeLocalUpload } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handler(async (req: Request) => {
  // Admin first: this endpoint writes to disk, so it never runs unauthenticated
  // even in dev.
  await requireAdmin();

  if (!config.useLocalUploads) {
    throw new ApiError("FORBIDDEN", "Local uploads are disabled.");
  }

  const key = new URL(req.url).searchParams.get("key");
  if (!key) throw new ApiError("BAD_REQUEST", "Missing upload key.");

  const body = await req.arrayBuffer();
  if (body.byteLength === 0) {
    throw new ApiError("BAD_REQUEST", "Empty upload.");
  }
  if (body.byteLength > config.limits.maxVideoBytes) {
    throw new ApiError("VALIDATION_FAILED", "Upload exceeds the maximum allowed size.");
  }

  // writeLocalUpload re-validates the key against path traversal.
  await writeLocalUpload(key, body);

  return ok({ key, size_bytes: body.byteLength }, 201);
});
