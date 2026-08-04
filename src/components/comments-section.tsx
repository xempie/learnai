"use client";

import { useEffect, useState } from "react";
import { Flag, MessageSquare, Trash2 } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { relativeTime } from "@/components/content-card";
import { ApiClientError, api } from "@/lib/api-client";

const MAX_LENGTH = 2000;
const PAGE_SIZE = 20;

const REASONS: { value: string; label: string }[] = [
  { value: "spam", label: "Spam or advertising" },
  { value: "abuse", label: "Abuse or harassment" },
  { value: "off_topic", label: "Off topic" },
  { value: "misinformation", label: "Misinformation" },
  { value: "other", label: "Something else" },
];

/* ---------------- API shapes ---------------- */

interface ApiCommentAuthor {
  id: string;
  nickname: string;
  avatar_url: string | null;
  avatar_key: string | null;
}

interface ApiComment {
  id: string;
  body: string;
  created_at: string;
  report_count: number;
  is_own: boolean;
  author: ApiCommentAuthor;
}

interface CommentListResponse {
  data: ApiComment[];
  next_cursor: string | null;
}

interface CreateCommentResponse {
  comment: ApiComment;
  comment_count: number;
}

interface DeleteCommentResponse {
  deleted: boolean;
  comment_count: number | null;
}

/**
 * The server writes its guardrail copy for humans (rate limits, the 24-hour
 * link rule, length). Show it verbatim - a generic "something went wrong"
 * would hide the one thing the person needs to know.
 */
function guardrailMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiClientError) return err.message;
  return fallback;
}

/** Stable avatar colour from the author id - the API serves no hue. */
function hueFor(id: string): number {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
  return hash;
}

function ReportForm({
  commentId,
  onDone,
  onCancel,
}: {
  commentId: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState("spam");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError("");
    try {
      await api.post(`/comments/${commentId}/report`, {
        reason,
        notes: notes.trim() === "" ? undefined : notes.trim(),
      });
      onDone();
    } catch (err) {
      setError(guardrailMessage(err, "We could not send that report. Try again."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="mt-3 rounded-card border border-line bg-band p-4">
      <fieldset>
        <legend className="text-sm font-semibold text-ink">Why are you reporting this?</legend>
        <div className="mt-2 flex flex-col gap-2">
          {REASONS.map((r) => (
            <label key={r.value} className="flex min-h-11 items-center gap-2.5 text-sm text-ink-muted">
              <input
                type="radio"
                name={`reason-${commentId}`}
                value={r.value}
                checked={reason === r.value}
                onChange={() => setReason(r.value)}
                className="size-4 accent-primary"
              />
              {r.label}
            </label>
          ))}
        </div>
      </fieldset>

      <label
        htmlFor={`notes-${commentId}`}
        className="mt-3 block text-sm font-semibold text-ink"
      >
        Anything else we should know? <span className="font-normal text-ink-faint">(optional)</span>
      </label>
      <textarea
        id={`notes-${commentId}`}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
        maxLength={500}
        className="mt-1.5 w-full rounded-field border border-line bg-surface px-4 py-2.5 text-sm text-ink"
      />

      {error && (
        <p role="status" aria-live="polite" className="mt-2 text-sm font-semibold text-danger">
          {error}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex min-h-11 items-center rounded-md bg-primary px-5 text-sm font-semibold text-on-primary hover:bg-primary-strong disabled:cursor-not-allowed disabled:bg-line-strong disabled:text-ink-faint"
        >
          {submitting ? "Sending" : "Submit report"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex min-h-11 items-center rounded-md border border-line px-5 text-sm font-semibold text-ink-muted hover:border-primary hover:text-primary-strong"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export function CommentsSection({
  topicId,
  initialCount = 0,
}: {
  topicId: string;
  /** Denormalised counter from the topic payload, used until the list loads. */
  initialCount?: number;
}) {
  const [comments, setComments] = useState<ApiComment[]>([]);
  const [count, setCount] = useState(initialCount);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [composerError, setComposerError] = useState("");

  const [openReportId, setOpenReportId] = useState<string | null>(null);
  const [reportedIds, setReportedIds] = useState<string[]>([]);
  const [statusMessage, setStatusMessage] = useState("");

  const remaining = MAX_LENGTH - draft.length;
  const nearLimit = remaining <= 100;
  const canSubmit = draft.trim().length > 0 && !submitting;

  // `loading` starts true, so the effect only ever writes state after the
  // request resolves - no synchronous setState inside an effect.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const res = await api.get<CommentListResponse>(`/topics/${topicId}/comments`, {
          limit: PAGE_SIZE,
        });
        if (cancelled) return;
        setLoadError("");
        setComments(res.data);
        setCursor(res.next_cursor);
        // With more pages outstanding the topic's denormalised counter is the
        // only total we have; on a single page the rows themselves are exact.
        setCount(res.next_cursor ? Math.max(initialCount, res.data.length) : res.data.length);
      } catch (err) {
        if (cancelled) return;
        setLoadError(guardrailMessage(err, "We could not load the comments. Try again."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [topicId, initialCount]);

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    setLoadError("");
    try {
      const res = await api.get<CommentListResponse>(`/topics/${topicId}/comments`, {
        limit: PAGE_SIZE,
        cursor,
      });
      setComments((prev) => {
        const known = new Set(prev.map((c) => c.id));
        return [...prev, ...res.data.filter((c) => !known.has(c.id))];
      });
      setCursor(res.next_cursor);
    } catch (err) {
      setLoadError(guardrailMessage(err, "We could not load more comments. Try again."));
    } finally {
      setLoadingMore(false);
    }
  }

  async function submitComment(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setComposerError("");
    try {
      const res = await api.post<CreateCommentResponse>(`/topics/${topicId}/comments`, {
        body: draft.trim(),
      });
      setComments((prev) => [res.comment, ...prev]);
      setCount(res.comment_count);
      setDraft("");
      setStatusMessage("Comment posted.");
      setTimeout(() => setStatusMessage(""), 2500);
    } catch (err) {
      setComposerError(guardrailMessage(err, "We could not post that comment. Try again."));
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteComment(id: string) {
    const previousComments = comments;
    const previousCount = count;
    setComments((prev) => prev.filter((c) => c.id !== id));
    setCount((c) => Math.max(0, c - 1));
    try {
      const res = await api.delete<DeleteCommentResponse>(`/comments/${id}`);
      if (typeof res?.comment_count === "number") setCount(res.comment_count);
      setStatusMessage("Comment deleted.");
      setTimeout(() => setStatusMessage(""), 2500);
    } catch (err) {
      setComments(previousComments);
      setCount(previousCount);
      setComposerError(guardrailMessage(err, "We could not delete that comment. Try again."));
    }
  }

  return (
    <section
      aria-labelledby="comments-heading"
      className="rounded-card border border-line bg-surface p-5 shadow-xs"
    >
      <h2 id="comments-heading" className="flex items-center gap-2 text-lg font-semibold">
        <MessageSquare className="size-5 text-primary-strong" aria-hidden="true" />
        Comments
        <span className="font-normal text-ink-faint">({count})</span>
      </h2>

      {/* ===== Composer ===== */}
      <form onSubmit={(e) => void submitComment(e)} className="mt-4">
        <label htmlFor="comment-body" className="block font-semibold text-ink">
          Add a comment
        </label>
        <p className="mt-1 text-sm text-ink-faint">
          Be constructive. Comments are moderated.
        </p>
        <textarea
          id="comment-body"
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, MAX_LENGTH))}
          rows={4}
          maxLength={MAX_LENGTH}
          placeholder="What did this change for you?"
          className="mt-2 w-full rounded-field border border-line bg-surface px-4 py-3 text-ink placeholder:text-ink-faint"
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <p
            aria-live={nearLimit ? "polite" : "off"}
            className={`text-sm font-medium tabular-nums ${
              nearLimit ? "text-danger" : "text-ink-faint"
            }`}
          >
            {remaining} character{remaining === 1 ? "" : "s"} left
          </p>
          <button
            type="submit"
            disabled={!canSubmit}
            className="inline-flex min-h-12 items-center rounded-md bg-primary px-6 font-semibold text-on-primary hover:bg-primary-strong disabled:cursor-not-allowed disabled:bg-line-strong disabled:text-ink-faint"
          >
            {submitting ? "Posting" : "Post comment"}
          </button>
        </div>
        {composerError && (
          <p role="alert" className="mt-2 text-sm font-semibold text-danger">
            {composerError}
          </p>
        )}
      </form>

      <p role="status" aria-live="polite" className="sr-only">
        {statusMessage}
      </p>

      {/* ===== Thread ===== */}
      {loading ? (
        <p role="status" aria-live="polite" className="mt-6 text-sm text-ink-faint">
          Loading comments
        </p>
      ) : loadError && comments.length === 0 ? (
        <p role="alert" className="mt-6 text-sm font-semibold text-danger">
          {loadError}
        </p>
      ) : comments.length === 0 ? (
        <div className="mt-6 rounded-card border border-dashed border-line-strong bg-band p-6 text-center">
          <p className="font-semibold text-ink">Be the first to comment</p>
          <p className="mt-1 text-sm text-ink-muted">
            Nobody has said anything here yet. If this was useful - or if it missed something -
            say so.
          </p>
        </div>
      ) : (
        <ul className="mt-6 flex flex-col divide-y divide-line">
          {comments.map((comment) => {
            const reported = reportedIds.includes(comment.id);
            return (
              <li key={comment.id} className="py-4 first:pt-0">
                <div className="flex items-start gap-3">
                  <Avatar
                    name={comment.author.nickname}
                    hue={hueFor(comment.author.id)}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-semibold text-ink">{comment.author.nickname}</span>
                      {comment.is_own && (
                        <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary-strong">
                          You
                        </span>
                      )}
                      <span className="text-xs font-medium text-ink-faint">
                        {relativeTime(comment.created_at)}
                      </span>
                    </div>
                    <p className="mt-1.5 whitespace-pre-line leading-relaxed text-ink-muted">
                      {comment.body}
                    </p>

                    <div className="mt-2">
                      {comment.is_own ? (
                        <button
                          type="button"
                          onClick={() => void deleteComment(comment.id)}
                          className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-ink-faint hover:text-danger"
                        >
                          <Trash2 className="size-4" aria-hidden="true" />
                          Delete
                        </button>
                      ) : reported ? (
                        <p
                          role="status"
                          className="inline-flex min-h-11 items-center text-sm font-semibold text-success"
                        >
                          Reported - thanks, we&rsquo;ll review it.
                        </p>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            setOpenReportId(openReportId === comment.id ? null : comment.id)
                          }
                          aria-expanded={openReportId === comment.id}
                          className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-ink-faint hover:text-primary-strong"
                        >
                          <Flag className="size-4" aria-hidden="true" />
                          Report
                        </button>
                      )}
                    </div>

                    {openReportId === comment.id && !reported && (
                      <ReportForm
                        commentId={comment.id}
                        onCancel={() => setOpenReportId(null)}
                        onDone={() => {
                          setReportedIds((prev) => [...prev, comment.id]);
                          setOpenReportId(null);
                        }}
                      />
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {cursor && (
        <button
          type="button"
          onClick={() => void loadMore()}
          disabled={loadingMore}
          className="mx-auto mt-4 flex min-h-12 items-center rounded-md border border-line bg-surface px-6 font-semibold text-ink-muted shadow-xs hover:border-primary hover:text-primary-strong disabled:cursor-not-allowed disabled:text-ink-faint"
        >
          {loadingMore ? "Loading" : "Load more comments"}
        </button>
      )}
    </section>
  );
}
