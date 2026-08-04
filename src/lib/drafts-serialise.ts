import type { contentDrafts } from "@/db/schema";

type DraftRow = typeof contentDrafts.$inferSelect;

export interface SerialisedDraft {
  id: string;
  draft_type: string;
  title: string;
  body: unknown;
  source_refs: unknown;
  status: string;
  review_notes: string | null;
  reviewed_at: string | null;
  target_topic_id: string | null;
  created_at: string;
}

/** The one place a content_drafts row becomes wire JSON. */
export function serialiseDraft(row: DraftRow): SerialisedDraft {
  return {
    id: row.id,
    draft_type: row.draftType,
    title: row.title,
    body: row.body,
    source_refs: row.sourceRefs,
    status: row.status,
    review_notes: row.reviewNotes,
    reviewed_at: row.reviewedAt ? row.reviewedAt.toISOString() : null,
    target_topic_id: row.targetTopicId,
    created_at: row.createdAt.toISOString(),
  };
}
