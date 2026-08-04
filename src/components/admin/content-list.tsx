"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Copy,
  EyeOff,
  Pencil,
  Plus,
  Search,
  Send,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { api } from "@/lib/api-client";
import { ConfirmDialog } from "./confirm-dialog";
import {
  BTN_PRIMARY,
  CARD,
  Chip,
  EmptyState,
  ErrorBox,
  FIELD,
  ICON_BTN,
  ICON_BTN_DANGER,
  LABEL,
  PageHeader,
  SkeletonRows,
  StatusBadge,
  TD,
  TH,
  TypeBadge,
  errorMessage,
  formatDate,
  formatDuration,
  num,
  useAsync,
  type TopicStatus,
  type TopicType,
} from "./admin-ui";

/* ============ API shapes (GET /api/v1/admin/topics) ============ */

interface AdminTopicCategory {
  id: string;
  slug: string;
  name: string;
  color_hex: string | null;
}

interface AdminTopicRow {
  id: string;
  type: TopicType;
  slug: string;
  title: string;
  excerpt: string | null;
  thumbnail_url: string | null;
  skill_level: string;
  episode_count: number;
  total_duration_sec: number;
  view_count: number;
  like_count: number;
  comment_count: number;
  categories: AdminTopicCategory[];
  author_name: string | null;
  published_at: string | null;
  publish_at: string | null;
  is_free: boolean;
  status: TopicStatus;
  updated_at: string;
}

interface AdminTopicListResponse {
  data: AdminTopicRow[];
}

const STATUS_OPTIONS: { value: "" | TopicStatus; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "in_review", label: "In review" },
  { value: "scheduled", label: "Scheduled" },
  { value: "published", label: "Published" },
  { value: "unpublished", label: "Unpublished" },
  { value: "rejected", label: "Rejected" },
];

type Pending =
  | { kind: "delete"; topic: AdminTopicRow }
  | { kind: "unpublish"; topic: AdminTopicRow }
  | null;

export function ContentList() {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState<"" | TopicStatus>("");
  const [type, setType] = useState<"" | TopicType>("");
  const [pending, setPending] = useState<Pending>(null);
  const [message, setMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const list = useAsync<AdminTopicListResponse>(`${status}|${type}|${debounced}`, () =>
    api.get<AdminTopicListResponse>("/admin/topics", {
      status: status || undefined,
      type: type || undefined,
      q: debounced || undefined,
    }),
  );

  const rows = list.data?.data ?? [];

  async function run(
    topic: AdminTopicRow,
    work: () => Promise<void>,
    success: string,
  ): Promise<void> {
    setBusyId(topic.id);
    setActionError("");
    setMessage("");
    try {
      await work();
      setMessage(success);
      list.reload();
    } catch (err) {
      // The publish endpoint answers 422 naming exactly what is missing
      // (no episodes, no captions, no category). Show it verbatim.
      setActionError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  function publish(topic: AdminTopicRow) {
    void run(
      topic,
      async () => {
        await api.post(`/admin/topics/${topic.id}/publish`, {});
      },
      `Published "${topic.title}".`,
    );
  }

  function unpublish(topic: AdminTopicRow) {
    void run(
      topic,
      async () => {
        await api.post(`/admin/topics/${topic.id}/unpublish`, {});
      },
      `Unpublished "${topic.title}".`,
    );
  }

  function duplicate(topic: AdminTopicRow) {
    void run(
      topic,
      async () => {
        await api.post(`/admin/topics/${topic.id}/duplicate`);
      },
      `Duplicated "${topic.title}" as a new draft.`,
    );
  }

  function remove(topic: AdminTopicRow) {
    void run(
      topic,
      async () => {
        await api.delete(`/admin/topics/${topic.id}`);
      },
      `Deleted "${topic.title}".`,
    );
  }

  function confirmPending() {
    const target = pending;
    setPending(null);
    if (!target) return;
    if (target.kind === "delete") remove(target.topic);
    else unpublish(target.topic);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Content"
        description="Every topic and article, in every state. A topic is a container of ordered episodes - open one to edit its episodes and upload video."
      >
        <Link href="/admin/content/new" className={BTN_PRIMARY}>
          <Plus className="size-5" aria-hidden="true" />
          New content
        </Link>
      </PageHeader>

      {/* ===== Toolbar ===== */}
      <div className={`${CARD} flex flex-wrap items-end gap-4 p-4`}>
        <div className="min-w-60 flex-1">
          <label htmlFor="content-search" className={LABEL}>
            Search
          </label>
          <div className="relative mt-1.5">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint"
              aria-hidden="true"
            />
            <input
              id="content-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Title, slug or excerpt"
              className={`${FIELD} pl-9`}
            />
          </div>
        </div>
        <div className="min-w-45">
          <label htmlFor="content-status" className={LABEL}>
            Status
          </label>
          <select
            id="content-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as "" | TopicStatus)}
            className={`${FIELD} mt-1.5`}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-45">
          <label htmlFor="content-type" className={LABEL}>
            Type
          </label>
          <select
            id="content-type"
            value={type}
            onChange={(e) => setType(e.target.value as "" | TopicType)}
            className={`${FIELD} mt-1.5`}
          >
            <option value="">All types</option>
            <option value="topic">Topics</option>
            <option value="article">Articles</option>
          </select>
        </div>
      </div>

      <p role="status" aria-live="polite" className="min-h-6 text-sm font-semibold text-success">
        {message}
      </p>

      {actionError && <ErrorBox message={actionError} />}

      {/* ===== Table ===== */}
      {list.error ? (
        <ErrorBox message={list.error} onRetry={list.reload} />
      ) : list.loading ? (
        <div className={`${CARD} p-4`}>
          <SkeletonRows rows={6} />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="Nothing matches those filters."
          hint="Clear the search box or widen the status and type filters."
        />
      ) : (
        <div className={`${CARD} overflow-x-auto`}>
          <table className="w-full min-w-280 border-collapse text-sm">
            <caption className="sr-only">{rows.length} content items</caption>
            <thead>
              <tr>
                <th scope="col" className={TH}>
                  Title
                </th>
                <th scope="col" className={TH}>
                  Type
                </th>
                <th scope="col" className={TH}>
                  Status
                </th>
                <th scope="col" className={TH}>
                  Categories
                </th>
                <th scope="col" className={`${TH} text-right`}>
                  Episodes
                </th>
                <th scope="col" className={`${TH} text-right`}>
                  Runtime
                </th>
                <th scope="col" className={TH}>
                  Published / scheduled
                </th>
                <th scope="col" className={`${TH} text-right`}>
                  Views
                </th>
                <th scope="col" className={`${TH} text-right`}>
                  Likes
                </th>
                <th scope="col" className={`${TH} text-right`}>
                  Comments
                </th>
                <th scope="col" className={`${TH} text-right`}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => {
                // Obvious blockers we can see from the list payload. The server
                // is still the authority and will name anything else in a 422.
                const noEpisodes = item.type === "topic" && item.episode_count === 0;
                const noCategory = item.categories.length === 0;
                const blocked = noEpisodes || noCategory;
                const canPublish = item.status !== "published" && !blocked;
                const busy = busyId === item.id;
                return (
                  <tr key={item.id}>
                    <td className={`${TD} max-w-80`}>
                      <Link
                        href={`/admin/topics/${item.id}`}
                        className="font-medium text-primary-strong underline-offset-2 hover:underline"
                      >
                        {item.title}
                      </Link>
                      <span className="mt-0.5 block text-xs text-ink-faint">/{item.slug}</span>
                      {blocked && (
                        <span className="mt-1.5 inline-flex">
                          <Chip tone="danger">
                            <TriangleAlert className="size-3.5" aria-hidden="true" />
                            {noEpisodes ? "Needs a episode before publish" : "Needs a category"}
                          </Chip>
                        </span>
                      )}
                    </td>
                    <td className={TD}>
                      <TypeBadge type={item.type} />
                    </td>
                    <td className={TD}>
                      <StatusBadge status={item.status} />
                    </td>
                    <td className={`${TD} text-ink-muted`}>
                      {item.categories.length === 0
                        ? "-"
                        : item.categories.map((c) => c.name).join(", ")}
                    </td>
                    <td className={`${TD} text-right tabular-nums`}>{num(item.episode_count)}</td>
                    <td className={`${TD} text-right tabular-nums`}>
                      {formatDuration(item.total_duration_sec)}
                    </td>
                    <td className={`${TD} whitespace-nowrap text-ink-muted`}>
                      {formatDate(item.published_at ?? item.publish_at)}
                    </td>
                    <td className={`${TD} text-right tabular-nums`}>{num(item.view_count)}</td>
                    <td className={`${TD} text-right tabular-nums`}>{num(item.like_count)}</td>
                    <td className={`${TD} text-right tabular-nums`}>{num(item.comment_count)}</td>
                    <td className={TD}>
                      <div className="flex justify-end gap-1.5">
                        <Link
                          href={`/admin/topics/${item.id}`}
                          aria-label={`Edit ${item.title}`}
                          title="Edit"
                          className={ICON_BTN}
                        >
                          <Pencil className="size-4" aria-hidden="true" />
                        </Link>
                        <button
                          type="button"
                          aria-label={`Duplicate ${item.title}`}
                          title="Duplicate"
                          disabled={busy}
                          onClick={() => duplicate(item)}
                          className={ICON_BTN}
                        >
                          <Copy className="size-4" aria-hidden="true" />
                        </button>
                        {item.status === "published" ? (
                          <button
                            type="button"
                            aria-label={`Unpublish ${item.title}`}
                            title="Unpublish"
                            disabled={busy}
                            onClick={() => setPending({ kind: "unpublish", topic: item })}
                            className={ICON_BTN}
                          >
                            <EyeOff className="size-4" aria-hidden="true" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            aria-label={
                              blocked
                                ? `Publish ${item.title} - blocked, ${noEpisodes ? "no episodes yet" : "no category"}`
                                : `Publish ${item.title}`
                            }
                            title={
                              noEpisodes
                                ? "Add at least one episode before publishing"
                                : noCategory
                                  ? "Pick at least one category before publishing"
                                  : "Publish"
                            }
                            disabled={!canPublish || busy}
                            onClick={() => publish(item)}
                            className={ICON_BTN}
                          >
                            <Send className="size-4" aria-hidden="true" />
                          </button>
                        )}
                        <button
                          type="button"
                          aria-label={`Delete ${item.title}`}
                          title="Delete"
                          disabled={busy}
                          onClick={() => setPending({ kind: "delete", topic: item })}
                          className={ICON_BTN_DANGER}
                        >
                          <Trash2 className="size-4" aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={pending?.kind === "delete"}
        title="Delete this content?"
        description={
          <>
            <strong className="text-ink">{pending?.topic.title}</strong> is removed from the
            catalogue and unpublished. Its comments, likes and analytics are retained, and the
            action is written to the audit log.
          </>
        }
        confirmLabel="Delete"
        destructive
        onConfirm={confirmPending}
        onCancel={() => setPending(null)}
      />

      <ConfirmDialog
        open={pending?.kind === "unpublish"}
        title="Unpublish this content?"
        description={
          <>
            <strong className="text-ink">{pending?.topic.title}</strong> disappears from the feed
            immediately and any pending schedule is cleared. You can publish it again later.
          </>
        }
        confirmLabel="Unpublish"
        onConfirm={confirmPending}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}
