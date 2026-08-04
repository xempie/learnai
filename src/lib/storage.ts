import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getSignedUrl as signCloudFrontUrl } from "@aws-sdk/cloudfront-signer";
import { ApiError } from "@/lib/api";
import { config } from "@/lib/config";

/**
 * Video and attachment storage.
 *
 * Production: presigned S3 PUT direct from the browser (never proxy a 500 MB
 * file through Lambda), served back through CloudFront with signed URLs.
 * Local dev (USE_LOCAL_UPLOADS=true): files land in ./public/uploads and are
 * served straight off the dev server, so the whole flow works with no AWS.
 */

let s3: S3Client | null = null;
function client(): S3Client {
  s3 ??= new S3Client({ region: config.region });
  return s3;
}

export type UploadKind = "video" | "thumbnail" | "captions" | "attachment" | "avatar";

const EXTENSIONS: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/x-m4v": "m4v",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "text/vtt": "vtt",
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "text/csv": "csv",
};

/**
 * Storage keys are always generated - never derived from the user-supplied
 * filename. That closes path traversal and collision issues in one move
 * (V1_BUILD_SPEC §3.1 attachment safety).
 */
export function buildKey(kind: UploadKind, topicId: string, mimeType: string): string {
  const ext = EXTENSIONS[mimeType] ?? "bin";
  return `${kind}/${topicId}/${randomUUID()}.${ext}`;
}

export function validateUpload(kind: UploadKind, mimeType: string, sizeBytes: number): void {
  if (kind === "video") {
    if (!config.videoMimeTypes.includes(mimeType as (typeof config.videoMimeTypes)[number])) {
      throw new ApiError("VALIDATION_FAILED", "Video must be MP4 or MOV.");
    }
    if (sizeBytes > config.limits.maxVideoBytes) {
      throw new ApiError("VALIDATION_FAILED", "Video exceeds the 500 MB limit.");
    }
    return;
  }
  if (kind === "captions") {
    if (mimeType !== "text/vtt") {
      throw new ApiError("VALIDATION_FAILED", "Captions must be a WebVTT (.vtt) file.");
    }
    return;
  }
  if (kind === "thumbnail" || kind === "avatar") {
    if (!["image/png", "image/jpeg", "image/webp"].includes(mimeType)) {
      throw new ApiError("VALIDATION_FAILED", "Image must be PNG, JPEG or WebP.");
    }
    if (sizeBytes > 5 * 1024 * 1024) {
      throw new ApiError("VALIDATION_FAILED", "Image exceeds the 5 MB limit.");
    }
    return;
  }
  // attachment
  if (
    !config.attachmentMimeTypes.includes(
      mimeType as (typeof config.attachmentMimeTypes)[number],
    )
  ) {
    throw new ApiError(
      "VALIDATION_FAILED",
      "Attachment type not allowed. Use PDF, PNG, JPG, DOCX, PPTX, XLSX or CSV.",
    );
  }
  if (sizeBytes > config.limits.maxAttachmentBytes) {
    throw new ApiError("VALIDATION_FAILED", "Attachment exceeds the 25 MB limit.");
  }
}

export interface PresignedUpload {
  /** Where the browser PUTs (S3) or POSTs (local dev). */
  uploadUrl: string;
  /** Store this on the row; it is not a URL. */
  key: string;
  /** 'PUT' for S3, 'POST' for the local dev endpoint. */
  method: "PUT" | "POST";
  headers: Record<string, string>;
  expiresInSec: number;
}

export async function createUploadUrl(
  kind: UploadKind,
  topicId: string,
  mimeType: string,
  sizeBytes: number,
): Promise<PresignedUpload> {
  validateUpload(kind, mimeType, sizeBytes);
  const key = buildKey(kind, topicId, mimeType);

  if (config.useLocalUploads) {
    return {
      uploadUrl: `/api/v1/uploads/local?key=${encodeURIComponent(key)}`,
      key,
      method: "POST",
      headers: {},
      expiresInSec: 3600,
    };
  }

  const bucket = kind === "video" ? config.s3.videoBucket : config.s3.assetsBucket;
  const url = await getSignedUrl(
    client(),
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: mimeType,
      ContentLength: sizeBytes,
    }),
    { expiresIn: 3600 },
  );

  return {
    uploadUrl: url,
    key,
    method: "PUT",
    headers: { "Content-Type": mimeType },
    expiresInSec: 3600,
  };
}

/** Writes an uploaded file in local-dev mode. */
export async function writeLocalUpload(key: string, data: ArrayBuffer): Promise<void> {
  if (!config.useLocalUploads) {
    throw new ApiError("FORBIDDEN", "Local uploads are disabled.");
  }
  // Reject anything that could escape the uploads directory.
  if (key.includes("..") || key.startsWith("/") || key.includes("\\")) {
    throw new ApiError("BAD_REQUEST", "Invalid upload key.");
  }
  const target = path.join(process.cwd(), "public", "uploads", key);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, Buffer.from(data));
}

/**
 * A time-limited URL for playback or download. Signed CloudFront in production;
 * a plain static path in local dev.
 *
 * Only call this AFTER an entitlement check has passed.
 */
export function signedMediaUrl(key: string | null, ttlSeconds = 3600): string | null {
  if (!key) return null;
  if (config.useLocalUploads) return `/uploads/${key}`;

  const { domain, keyPairId, privateKey } = config.cloudfront;
  if (!domain || !keyPairId || !privateKey) {
    // Misconfiguration must not silently serve an unsigned, public URL.
    throw new ApiError("NOT_CONFIGURED", "Media delivery is not configured.");
  }

  return signCloudFrontUrl({
    url: `https://${domain}/${key}`,
    keyPairId,
    privateKey: privateKey.replace(/\\n/g, "\n"),
    dateLessThan: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
  });
}

/** Public (unsigned) URL for non-sensitive assets like thumbnails. */
export function publicAssetUrl(key: string | null): string | null {
  if (!key) return null;
  if (config.useLocalUploads) return `/uploads/${key}`;
  if (!config.cloudfront.domain) return null;
  return `https://${config.cloudfront.domain}/${key}`;
}
