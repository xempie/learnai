"use client";

import { useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, Flag, Info, MessageSquare, Trash2 } from "lucide-react";
import { api } from "@/lib/api-client";
import { Avatar } from "@/components/avatar";
import { ConfirmDialog } from "./confirm-dialog";
import {
  BTN_DANGER,
  BTN_SECONDARY,
  CARD,
  Chip,
  EmptyState,
  ErrorBox,
  FIELD,
  LABEL,
  PageHeader,
  SkeletonRows,
  errorMessage,
  formatDateTime,
  hueFor,
  num,
  useAsync,
} from "./admin-ui";

/* ============ API shapes ============ */

interface AdminComment {
  id: string;
  body: string;
  status: "visible" | "hidden" | "deleted";
  report_count: number;
  open_reports: number;
  hidden_at: string | null;
  created_at: string;
  author: { id: string; nickname: string };
  topic: { id: string; title: string; slug: string; type: string };
}

interface AdminReport {
  id: string;
  reason: string;
  notes: string | null;
  status: "open" | "resolved" | "dismissed";
  created_at: string;
  resolved_at: string | null;
  reporter: { id: string; nickname: string };
  comment: { id: string; body: string; status: string; report_count: number };
  topic: { id: string; title: string; slug: string };
}

type Tab = "reports" | "comments";
type ReportStatus = "open" | "resolved" | "dismissed";
type CommentFilter = "all" | "reported" | "hidden";

const REASON_LABEL: Record<string, string> = {
  spam: "Spam",
  abuse: "Abuse",
  off_topic: "Off topic",
  misinformation: "Misinformation",
  harassment: "Harassment",
  other: "Other",
};

function reasonLabel(reason: string): string {
  return REASON_LABEL[reason] ?? reason.replace(/_/g, " ");
}

export function ModerationView() {
  const [tab, setTab] = useState<Tab>("reports");
  const [reportStatus, setReportStatus] = useState<ReportStatus>("open");
  const [commentFilter, setCommentFilter] = useState<CommentFilter>("all");
  const [message, setMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AdminComment | null>(null);

  const reports = useAsync<{ status: string; data: AdminReport[] }>(
    `reports|${reportStatus}`,
    () =>
      api.get<{ status: string; data: AdminReport[] }>("/admin/reports", {
        status: reportStatus,
      }),
  );

  const comments = useAsync<{ data: AdminComment[] }>(`comments|${commentFilter}`, () =>
    api.get<{ data: AdminComment[] }>("/admin/comments", {
      status: commentFilter === "hidden" ? "hidden" : undefined,
      reported: commentFilter === "reported" ? "true" : undefined,
    }),
  );

  const openReports = reports.data?.data.filter((r) => r.status === "open").length ?? 0;

  async function mutate(id: string, work: () => Promise<string>) {
    setBusyId(id);
    setActionError("");
    setMessage("");
    try {
      setMessage(await work());
      reports.reload();
      comments.reload();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  function resolveReport(report: AdminReport, action: "hide" | "dismiss") {
    void mutate(report.id, async () => {
      await api.post(`/admin/reports/${report.id}/resolve`, { action });
      return action === "hide"
        ? `Comment hidden and every open report against it resolved. Logged to the audit trail.`
        : `Report from ${report.reporter.nickname} dismissed. Logged to the audit trail.`;
    });
  }

  function setCommentVisibility(comment: AdminComment, action: "hide" | "unhide") {
    void mutate(comment.id, async () => {
      await api.post(`/admin/comments/${comment.id}`, { action });
      return action === "hide"
        ? `Comment by ${comment.author.nickname} hidden. Logged to the audit trail.`
        : `Comment by ${comment.author.nickname} is visible again. Logged to the audit trail.`;
    });
  }

  function confirmDelete() {
    const target = pendingDelete;
    setPendingDelete(null);
    if (!target) return;
    void mutate(target.id, async () => {
      await api.delete(`/admin/comments/${target.id}`);
      return `Comment by ${target.author.nickname} deleted. Logged to the audit trail.`;
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Moderation"
        description="Reports raised by learners, and the full comment stream behind them."
      />

      {/* ===== Tabs ===== */}
      <div role="tablist" aria-label="Moderation views" className="flex flex-wrap gap-2">
        {(
          [
            { value: "reports", label: "Reports", icon: Flag, badge: openReports },
            { value: "comments", label: "Comments", icon: MessageSquare, badge: 0 },
          ] as const
        ).map((t) => (
          <button
            key={t.value}
            type="button"
            role="tab"
            id={`tab-${t.value}`}
            aria-selected={tab === t.value}
            aria-controls={`panel-${t.value}`}
            onClick={() => setTab(t.value)}
            className={`inline-flex min-h-12 items-center gap-2 rounded-md border px-4 font-semibold transition-colors ${
              tab === t.value
                ? "border-primary bg-primary-soft text-primary-strong"
                : "border-line text-ink-muted hover:border-line-strong"
            }`}
          >
            <t.icon className="size-4" aria-hidden="true" />
            {t.label}
            {t.badge > 0 && (
              <span className="rounded-md bg-danger-soft px-1.5 py-0.5 text-xs font-semibold text-danger">
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      <p role="status" aria-live="polite" className="min-h-6 text-sm font-semibold text-success">
        {message}
      </p>

      {actionError && <ErrorBox message={actionError} />}

      {/* ===== Reports ===== */}
      {tab === "reports" && (
        <div
          role="tabpanel"
          id="panel-reports"
          aria-labelledby="tab-reports"
          className="flex flex-col gap-4"
        >
          <div className={`${CARD} flex flex-wrap items-end gap-4 p-4`}>
            <div className="min-w-45">
              <label htmlFor="report-filter" className={LABEL}>
                Show
              </label>
              <select
                id="report-filter"
                value={reportStatus}
                onChange={(e) => setReportStatus(e.target.value as ReportStatus)}
                className={`${FIELD} mt-1.5`}
              >
                <option value="open">Open</option>
                <option value="resolved">Resolved</option>
                <option value="dismissed">Dismissed</option>
              </select>
            </div>
            <p className="text-sm text-ink-muted">
              {num(reports.data?.data.length ?? 0)} in this queue
            </p>
          </div>

          {reports.error ? (
            <ErrorBox message={reports.error} onRetry={reports.reload} />
          ) : reports.loading ? (
            <div className={`${CARD} p-4`}>
              <SkeletonRows rows={3} />
            </div>
          ) : (reports.data?.data.length ?? 0) === 0 ? (
            <EmptyState
              title="Nothing in this queue."
              hint="Reports arrive here the moment a learner flags a comment."
            />
          ) : (
            <ul className="flex flex-col gap-4">
              {reports.data?.data.map((report) => {
                const busy = busyId === report.id;
                return (
                  <li key={report.id} className={`${CARD} p-5`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <Chip tone="danger">{reasonLabel(report.reason)}</Chip>
                      {report.status === "open" ? (
                        <Chip tone="streak">Open</Chip>
                      ) : (
                        <Chip tone="success">
                          {report.status === "resolved" ? "Resolved" : "Dismissed"}
                        </Chip>
                      )}
                      {report.comment.status === "hidden" && <Chip>Comment hidden</Chip>}
                      <span className="ml-auto text-xs text-ink-faint">
                        {formatDateTime(report.created_at)}
                      </span>
                    </div>

                    <blockquote className="mt-3 rounded-md border-l-2 border-line-strong bg-band px-4 py-3 text-sm leading-relaxed text-ink">
                      {report.comment.body}
                    </blockquote>

                    <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                      <div className="flex gap-2">
                        <dt className="font-semibold text-ink-muted">On</dt>
                        <dd className="min-w-0">
                          <Link
                            href={`/admin/topics/${report.topic.id}`}
                            className="text-primary-strong underline-offset-2 hover:underline"
                          >
                            {report.topic.title}
                          </Link>
                        </dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="font-semibold text-ink-muted">Reported by</dt>
                        <dd>{report.reporter.nickname}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="font-semibold text-ink-muted">Reports on this comment</dt>
                        <dd>{num(report.comment.report_count)}</dd>
                      </div>
                      {report.notes && (
                        <div className="flex gap-2 sm:col-span-2">
                          <dt className="font-semibold text-ink-muted">Notes</dt>
                          <dd className="text-ink-muted">{report.notes}</dd>
                        </div>
                      )}
                    </dl>

                    {report.status === "open" && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => resolveReport(report, "hide")}
                          className={BTN_SECONDARY}
                        >
                          <EyeOff className="size-4" aria-hidden="true" />
                          Hide comment
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => resolveReport(report, "dismiss")}
                          className={BTN_SECONDARY}
                        >
                          Dismiss report
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* ===== Comments ===== */}
      {tab === "comments" && (
        <div
          role="tabpanel"
          id="panel-comments"
          aria-labelledby="tab-comments"
          className="flex flex-col gap-4"
        >
          <div className={`${CARD} flex flex-wrap items-end gap-4 p-4`}>
            <div className="min-w-45">
              <label htmlFor="comment-filter" className={LABEL}>
                Show
              </label>
              <select
                id="comment-filter"
                value={commentFilter}
                onChange={(e) => setCommentFilter(e.target.value as CommentFilter)}
                className={`${FIELD} mt-1.5`}
              >
                <option value="all">All comments</option>
                <option value="reported">Reported</option>
                <option value="hidden">Hidden</option>
              </select>
            </div>
            <p className="text-sm text-ink-muted">
              {num(comments.data?.data.length ?? 0)} shown
            </p>
          </div>

          {comments.error ? (
            <ErrorBox message={comments.error} onRetry={comments.reload} />
          ) : comments.loading ? (
            <div className={`${CARD} p-4`}>
              <SkeletonRows rows={3} />
            </div>
          ) : (comments.data?.data.length ?? 0) === 0 ? (
            <EmptyState title="No comments match that filter." />
          ) : (
            <ul className="flex flex-col gap-3">
              {comments.data?.data.map((comment) => {
                const busy = busyId === comment.id;
                return (
                  <li key={comment.id} className={`${CARD} p-5`}>
                    <div className="flex flex-wrap items-start gap-3">
                      <Avatar
                        name={comment.author.nickname}
                        hue={hueFor(comment.author.nickname)}
                        size="md"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold">{comment.author.nickname}</span>
                          {comment.status === "hidden" && <Chip tone="danger">Hidden</Chip>}
                          {comment.report_count > 0 && (
                            <Chip tone="streak">
                              <Flag className="size-3.5" aria-hidden="true" />
                              {num(comment.report_count)} report
                              {comment.report_count === 1 ? "" : "s"}
                              {comment.open_reports > 0
                                ? ` (${num(comment.open_reports)} open)`
                                : ""}
                            </Chip>
                          )}
                        </p>
                        <p className="mt-0.5 text-xs text-ink-faint">
                          on{" "}
                          <Link
                            href={`/admin/topics/${comment.topic.id}`}
                            className="text-primary-strong underline-offset-2 hover:underline"
                          >
                            {comment.topic.title}
                          </Link>{" "}
                          · {formatDateTime(comment.created_at)}
                        </p>
                        <p className="mt-2 text-sm leading-relaxed text-ink">{comment.body}</p>

                        <div className="mt-4 flex flex-wrap gap-2">
                          {comment.status === "hidden" ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => setCommentVisibility(comment, "unhide")}
                              className={BTN_SECONDARY}
                            >
                              <Eye className="size-4" aria-hidden="true" />
                              Unhide
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => setCommentVisibility(comment, "hide")}
                              className={BTN_SECONDARY}
                            >
                              <EyeOff className="size-4" aria-hidden="true" />
                              Hide
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setPendingDelete(comment)}
                            className={BTN_DANGER}
                          >
                            <Trash2 className="size-4" aria-hidden="true" />
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      <p className="flex items-start gap-2 rounded-md border border-line bg-surface px-3 py-2.5 text-xs leading-relaxed text-ink-faint">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        Every moderation action - hide, unhide, delete, resolve, dismiss - is written to the audit
        log with the acting admin, the target and a timestamp. Deleting is a soft delete: the row
        is kept so reports and the audit trail still resolve, but the body is never served again.
      </p>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this comment?"
        description={
          <>
            The comment by{" "}
            <strong className="text-ink">{pendingDelete?.author.nickname}</strong> stops being
            served to everyone and cannot be restored from this screen. Consider hiding it instead
            if you may need it visible again later.
          </>
        }
        confirmLabel="Delete comment"
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
