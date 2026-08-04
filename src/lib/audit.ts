import "server-only";

import { db } from "@/db";
import { analyticsEvents, auditLog } from "@/db/schema";

/**
 * Audit trail for privacy- and money-relevant actions. Never log email
 * addresses, tokens or full request bodies - log identifiers (§9.2).
 */
export async function audit(entry: {
  actorId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
}): Promise<void> {
  try {
    await db.insert(auditLog).values({
      actorId: entry.actorId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      metadata: entry.metadata ?? null,
      ipAddress: entry.ipAddress ?? null,
    });
  } catch (err) {
    // Auditing must never take down the request it is recording.
    console.error("[audit] write failed", { action: entry.action, err });
  }
}

/** Append-only product analytics (V1_BUILD_SPEC §5.3). */
export async function track(events: {
  userId?: string | null;
  sessionId?: string | null;
  event: string;
  topicId?: string | null;
  episodeId?: string | null;
  categoryId?: string | null;
  metadata?: Record<string, unknown>;
}[]): Promise<void> {
  if (events.length === 0) return;
  try {
    await db.insert(analyticsEvents).values(
      events.map((e) => ({
        userId: e.userId ?? null,
        sessionId: e.sessionId ?? null,
        event: e.event,
        topicId: e.topicId ?? null,
        episodeId: e.episodeId ?? null,
        categoryId: e.categoryId ?? null,
        metadata: e.metadata ?? null,
      })),
    );
  } catch (err) {
    console.error("[analytics] write failed", err);
  }
}

/** Events the client is allowed to submit (server-side events are separate). */
export const CLIENT_EVENTS = new Set([
  "feed_impression",
  "content_opened",
  "video_started",
  "video_progress",
  "video_completed",
  "post_read",
  "like_added",
  "like_removed",
  "bookmark_added",
  "bookmark_removed",
  "comment_posted",
  "share_clicked",
  "affiliate_clicked",
  "category_filtered",
  "search_performed",
  "notification_opened",
  "registration_completed",
  "cohort_opt_in",
  "cohort_opt_out",
]);
