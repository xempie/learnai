"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, ExternalLink, Info } from "lucide-react";
import { api } from "@/lib/api-client";
import { relativeTime } from "@/components/content-card";
import { MarkdownBody } from "@/components/markdown-body";
import { ConfirmDialog } from "./confirm-dialog";
import {
  BTN_DANGER,
  BTN_PRIMARY,
  BTN_SECONDARY,
  CARD,
  Chip,
  EmptyState,
  ErrorBox,
  LABEL,
  PageHeader,
  SkeletonRows,
  TEXTAREA,
  errorMessage,
  useAsync,
} from "./admin-ui";

/* ============ API shapes (snake_case, straight from /api/v1/admin/drafts*) ============ */

interface SourceRef {
  url: string;
  title?: string;
}

type DraftType = "script" | "shot_list" | "news_post" | "social_post";
type DraftStatus = "pending_review" | "approved" | "rejected" | "published";

interface AdminDraft {
  id: string;
  draft_type: DraftType;
  title: string;
  body: { markdown?: string } | null;
  source_refs: SourceRef[] | null;
  status: DraftStatus;
  review_notes: string | null;
  reviewed_at: string | null;
  target_topic_id: string | null;
  created_at: string;
}

interface DraftListResponse {
  data: AdminDraft[];
}

const TABS: { value: DraftStatus; label: string }[] = [
  { value: "pending_review", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "published", label: "Published" },
];

const TYPE_LABEL: Record<DraftType, string> = {
  script: "Script",
  shot_list: "Shot list",
  news_post: "News post",
  social_post: "Social post",
};

function typeTone(type: DraftType): "primary" | "streak" | "neutral" {
  if (type === "news_post") return "primary";
  if (type === "social_post") return "streak";
  return "neutral";
}

export function DraftsView() {
  const router = useRouter();
  const [tab, setTab] = useState<DraftStatus>("pending_review");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingReject, setPendingReject] = useState<AdminDraft | null>(null);
  const [rejectNotes, setRejectNotes] = useState("");

  const list = useAsync<DraftListResponse>(`drafts|${tab}`, () =>
    api.get<DraftListResponse>("/admin/drafts", { status: tab }),
  );

  const rows = list.data?.data ?? [];
  const activeTab = TABS.find((t) => t.value === tab);

  function toggleExpanded(draft: AdminDraft) {
    setExpandedId((current) => (current === draft.id ? null : draft.id));
  }

  async function mutate(id: string, work: () => Promise<string>) {
    setBusyId(id);
    setActionError("");
    setMessage("");
    try {
      setMessage(await work());
      // Reload from the server rather than splicing the response into the
      // current snapshot - same reasoning as leads-view's updateStatus: a
      // stale local copy could silently drop a second overlapping action.
      list.reload();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  function approve(draft: AdminDraft) {
    void mutate(draft.id, async () => {
      await api.post(`/admin/drafts/${draft.id}/review`, { action: "approve" });
      return `"${draft.title}" approved.`;
    });
  }

  function openReject(draft: AdminDraft) {
    setRejectNotes("");
    setPendingReject(draft);
  }

  function confirmReject() {
    const target = pendingReject;
    setPendingReject(null);
    if (!target) return;
    const notes = rejectNotes.trim();
    void mutate(target.id, async () => {
      await api.post(`/admin/drafts/${target.id}/review`, {
        action: "reject",
        notes: notes || undefined,
      });
      return `"${target.title}" rejected.`;
    });
  }

  function promote(draft: AdminDraft) {
    void mutate(draft.id, async () => {
      const result = await api.post<{ topic_id: string }>(`/admin/drafts/${draft.id}/promote`);
      router.push(`/admin/topics/${result.topic_id}`);
      return `"${draft.title}" promoted to a new article.`;
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Drafts"
        description="Content drafted by the agent pipeline, waiting on a human decision before it goes anywhere near a learner."
      />

      {/* ===== Tabs ===== */}
      <div role="tablist" aria-label="Draft status" className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            role="tab"
            id={`tab-${t.value}`}
            aria-selected={tab === t.value}
            aria-controls={`panel-${t.value}`}
            onClick={() => {
              setTab(t.value);
              setExpandedId(null);
            }}
            className={`inline-flex min-h-12 items-center gap-2 rounded-md border px-4 font-semibold transition-colors ${
              tab === t.value
                ? "border-primary bg-primary-soft text-primary-strong"
                : "border-line text-ink-muted hover:border-line-strong"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <p role="status" aria-live="polite" className="min-h-6 text-sm font-semibold text-success">
        {message}
      </p>

      {actionError && <ErrorBox message={actionError} />}

      {/* ===== List ===== */}
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {list.error ? (
          <ErrorBox message={list.error} onRetry={list.reload} />
        ) : list.loading ? (
          <div className={`${CARD} p-4`}>
            <SkeletonRows rows={3} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            title={
              tab === "pending_review"
                ? "Nothing waiting for review."
                : `No ${(activeTab?.label ?? tab).toLowerCase()} drafts.`
            }
            hint={
              tab === "pending_review"
                ? "Drafts arrive here from the agent pipeline."
                : undefined
            }
          />
        ) : (
          <ul className="flex flex-col gap-4">
            {rows.map((draft) => {
              const expanded = expandedId === draft.id;
              const busy = busyId === draft.id;
              const markdown = draft.body?.markdown ?? "";
              const refs = draft.source_refs ?? [];
              return (
                <li key={draft.id} className={`${CARD} p-5`}>
                  <div className="flex flex-wrap items-start gap-3">
                    <button
                      type="button"
                      onClick={() => toggleExpanded(draft)}
                      aria-expanded={expanded}
                      aria-label={expanded ? "Collapse draft" : "Expand draft"}
                      className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-md text-ink-muted hover:bg-band hover:text-ink"
                    >
                      {expanded ? (
                        <ChevronDown className="size-4" aria-hidden="true" />
                      ) : (
                        <ChevronRight className="size-4" aria-hidden="true" />
                      )}
                    </button>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Chip tone={typeTone(draft.draft_type)}>
                          {TYPE_LABEL[draft.draft_type]}
                        </Chip>
                        <span className="text-xs font-medium text-ink-faint">
                          {relativeTime(draft.created_at)}
                        </span>
                        {draft.target_topic_id && (
                          <Link
                            href={`/admin/topics/${draft.target_topic_id}`}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-primary-strong underline-offset-2 hover:underline"
                          >
                            View article
                            <ExternalLink className="size-3" aria-hidden="true" />
                          </Link>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => toggleExpanded(draft)}
                        className="mt-1.5 block text-left font-display text-base font-semibold text-ink hover:text-primary-strong"
                      >
                        {draft.title}
                      </button>

                      {refs.length > 0 && (
                        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                          {refs.map((ref, i) => (
                            <li key={`${draft.id}-ref${i}`}>
                              <a
                                href={ref.url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-primary-strong underline-offset-2 hover:underline"
                              >
                                <ExternalLink className="size-3" aria-hidden="true" />
                                {ref.title || ref.url}
                              </a>
                            </li>
                          ))}
                        </ul>
                      )}

                      {expanded && (
                        <div className="mt-4 rounded-md border border-line bg-band/40 p-4">
                          <MarkdownBody source={markdown} />
                          {draft.review_notes && (
                            <div className="mt-4 border-t border-line pt-3">
                              <p className={LABEL}>Review notes</p>
                              <p className="mt-1 text-sm text-ink-muted">{draft.review_notes}</p>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="mt-4 flex flex-wrap gap-2">
                        {draft.status === "pending_review" && (
                          <>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => approve(draft)}
                              className={BTN_PRIMARY}
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => openReject(draft)}
                              className={BTN_DANGER}
                            >
                              Reject
                            </button>
                          </>
                        )}
                        {draft.status === "approved" &&
                          draft.draft_type === "news_post" &&
                          !draft.target_topic_id && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => promote(draft)}
                              className={BTN_SECONDARY}
                            >
                              Create article
                            </button>
                          )}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="flex items-start gap-2 rounded-md border border-line bg-surface px-3 py-2.5 text-xs leading-relaxed text-ink-faint">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        Nothing an agent drafts reaches a learner without a founder decision here first. Approving
        a news post does not publish it - Create article hands it to the normal editor and publish
        gate.
      </p>

      <ConfirmDialog
        open={pendingReject !== null}
        title="Reject this draft?"
        description={
          <>
            <p>
              <strong className="text-ink">{pendingReject?.title}</strong> moves to rejected and
              cannot be approved from this screen again.
            </p>
            <label htmlFor="reject-notes" className={`${LABEL} mt-3`}>
              Notes (optional)
            </label>
            <textarea
              id="reject-notes"
              value={rejectNotes}
              onChange={(e) => setRejectNotes(e.target.value)}
              rows={3}
              placeholder="Why this isn't going anywhere."
              className={`${TEXTAREA} mt-1.5`}
            />
          </>
        }
        confirmLabel="Reject draft"
        destructive
        onConfirm={confirmReject}
        onCancel={() => setPendingReject(null)}
      />
    </div>
  );
}
