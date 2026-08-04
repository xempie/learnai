/**
 * POST /api/v1/admin/topics/[id]/upload-url
 *   { kind, mimeType, sizeBytes, filename? } -> presigned descriptor
 *
 * The browser then uploads DIRECTLY to the returned URL and PATCHes the episode
 * or topic with the returned `key`. The file never passes through this API.
 */

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { topics } from "@/db/schema";
import { ApiError, handler, ok, parseBody } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { uploadUrlSchema } from "@/lib/schemas/content";
import { createUploadUrl } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    await requireAdmin();
    const { id } = await ctx.params;
    const input = await parseBody(req, uploadUrlSchema);

    const topic = await db.query.topics.findFirst({
      where: eq(topics.id, id),
      columns: { id: true, deletedAt: true },
    });
    if (!topic || topic.deletedAt) throw new ApiError("NOT_FOUND", "Topic not found.");

    // createUploadUrl runs validateUpload(), which enforces the mime allowlist
    // and the per-kind size caps, and generates the key server-side.
    const presigned = await createUploadUrl(
      input.kind,
      topic.id,
      input.mimeType,
      input.sizeBytes,
    );

    return ok(
      {
        upload_url: presigned.uploadUrl,
        key: presigned.key,
        method: presigned.method,
        headers: presigned.headers,
        expires_in_sec: presigned.expiresInSec,
        kind: input.kind,
        // Echoed back so the client can pair the key with the file it picked;
        // it is never part of the storage key.
        filename: input.filename ?? null,
      },
      201,
    );
  },
);
