"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Captions,
  Check,
  ChevronDown,
  ChevronUp,
  Film,
  Image as ImageIcon,
  Info,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { api } from "@/lib/api-client";
import { ConfirmDialog } from "./confirm-dialog";
import {
  BTN_PRIMARY,
  BTN_SECONDARY,
  CARD,
  Chip,
  EmptyState,
  ErrorBox,
  FIELD,
  ICON_BTN,
  ICON_BTN_DANGER,
  LABEL,
  MAX_EPISODE_DURATION_SEC,
  MAX_VIDEO_BYTES,
  PageHeader,
  SectionCard,
  SkeletonRows,
  StatusBadge,
  TEXTAREA,
  UploadStatusBadge,
  errorMessage,
  formatDuration,
  num,
  slugify,
  useAsync,
  type TopicStatus,
  type TopicType,
  type SkillLevel,
  type UploadStatus,
} from "./admin-ui";

/* ============================================================
   API shapes
   ============================================================ */

interface CategoryRef {
  id: string;
  slug: string;
  name: string;
  color_hex: string | null;
}

interface AdminCategory extends CategoryRef {
  description: string | null;
  sort_order: number;
  is_active: boolean;
  topic_count: number;
}

interface TopicLink {
  id: string;
  url: string;
  label: string | null;
}

interface TopicDetail {
  id: string;
  type: TopicType;
  slug: string;
  title: string;
  subtitle: string | null;
  body: string | null;
  excerpt: string | null;
  thumbnail_url: string | null;
  skill_level: SkillLevel;
  episode_count: number;
  total_duration_sec: number;
  view_count: number;
  status: TopicStatus;
  published_at: string | null;
  publish_at: string | null;
  is_free: boolean;
  links: TopicLink[];
  hashtags: string[];
  categories: CategoryRef[];
  affiliate_tool: string | null;
  affiliate_url: string | null;
  is_sponsored: boolean;
  sponsor_name: string | null;
  disclosure_text: string | null;
  updated_at: string;
}

export interface AdminEpisode {
  id: string;
  topic_id: string;
  slug: string;
  title: string;
  description: string | null;
  sort_order: number;
  duration_sec: number;
  is_preview: boolean;
  upload_status: UploadStatus;
  upload_error: string | null;
  has_captions: boolean;
  thumbnail_url: string | null;
  video_s3_key: string | null;
  captions_key: string | null;
  thumbnail_key: string | null;
}

interface UploadDescriptor {
  upload_url: string;
  key: string;
  method: "PUT" | "POST";
  headers: Record<string, string>;
  expires_in_sec: number;
  kind: string;
  filename: string | null;
}

type UploadKind = "video" | "thumbnail" | "captions";

const VIDEO_MIME = ["video/mp4", "video/quicktime", "video/x-m4v"];
const IMAGE_MIME = ["image/png", "image/jpeg", "image/webp"];
const MAX_LINKS = 10;

/* ============================================================
   Upload plumbing - presign, direct upload, then attach the key
   ============================================================ */

/**
 * XMLHttpRequest rather than fetch: only XHR reports upload progress, and a
 * 400 MB video with no progress bar looks identical to a hung tab.
 */
function putFile(
  descriptor: UploadDescriptor,
  file: File,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(descriptor.method, descriptor.upload_url, true);
    for (const [name, value] of Object.entries(descriptor.headers)) {
      xhr.setRequestHeader(name, value);
    }
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable && e.total > 0) {
        onProgress(Math.min(99, Math.round((e.loaded / e.total) * 100)));
      }
    });
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve();
        return;
      }
      reject(new Error(readXhrError(xhr)));
    });
    xhr.addEventListener("error", () =>
      reject(new Error("The upload connection dropped. Check your network and try again.")),
    );
    xhr.addEventListener("abort", () => reject(new Error("Upload cancelled.")));
    xhr.send(file);
  });
}

function readXhrError(xhr: XMLHttpRequest): string {
  try {
    const parsed: unknown = JSON.parse(xhr.responseText);
    const message = (parsed as { error?: { message?: string } })?.error?.message;
    if (typeof message === "string" && message.length > 0) return message;
  } catch {
    // Not JSON - S3 answers XML. Fall through to the status code.
  }
  return `Upload failed (HTTP ${xhr.status}). Please try again.`;
}

/** Reads duration client-side so a 400 MB file is never uploaded to be rejected. */
function readVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.addEventListener("loadedmetadata", () => {
      const seconds = video.duration;
      URL.revokeObjectURL(url);
      if (!Number.isFinite(seconds) || seconds <= 0) {
        reject(new Error("Could not read the length of that video. Try re-exporting it as MP4."));
        return;
      }
      resolve(seconds);
    });
    video.addEventListener("error", () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file could not be read as a video. Use MP4 or MOV."));
    });
    video.src = url;
  });
}

/** Steps 1 and 2 of the three-step flow. Returns the storage key. */
async function uploadToStorage(
  topicId: string,
  kind: UploadKind,
  file: File,
  mimeType: string,
  onProgress: (pct: number) => void,
): Promise<string> {
  const descriptor = await api.post<UploadDescriptor>(
    `/admin/topics/${topicId}/upload-url`,
    { kind, mimeType, sizeBytes: file.size, filename: file.name },
  );
  await putFile(descriptor, file, onProgress);
  return descriptor.key;
}

/** Captions arrive as text/vtt even when the browser reports an empty type. */
function mimeFor(kind: UploadKind, file: File): string {
  if (kind === "captions") return "text/vtt";
  return file.type;
}

function validateFile(kind: UploadKind, file: File): string | null {
  if (kind === "video") {
    if (!VIDEO_MIME.includes(file.type)) return "Video must be an MP4 or MOV file.";
    if (file.size > MAX_VIDEO_BYTES) return "Video exceeds the 500 MB limit.";
    return null;
  }
  if (kind === "thumbnail") {
    if (!IMAGE_MIME.includes(file.type)) return "Thumbnail must be a PNG, JPEG or WebP image.";
    if (file.size > 5 * 1024 * 1024) return "Thumbnail exceeds the 5 MB limit.";
    return null;
  }
  if (!/\.vtt$/i.test(file.name)) return "Captions must be a WebVTT (.vtt) file.";
  return null;
}

/* ============================================================
   Small upload control
   ============================================================ */

function UploadControl({
  id,
  label,
  hint,
  accept,
  icon,
  attached,
  busy,
  progress,
  onPick,
}: {
  id: string;
  label: string;
  hint: string;
  accept: string;
  icon: React.ReactNode;
  attached: boolean;
  busy: boolean;
  progress: number;
  onPick: (file: File) => void;
}) {
  return (
    <div className="min-w-52 flex-1">
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <label
        htmlFor={id}
        className={`mt-1.5 flex min-h-12 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm font-semibold transition-colors ${
          attached
            ? "border-success/40 bg-success-soft text-success"
            : "border-line text-ink-muted hover:border-primary hover:text-primary-strong"
        } ${busy ? "cursor-progress opacity-70" : ""}`}
      >
        {attached ? <Check className="size-4" aria-hidden="true" /> : icon}
        {busy ? `Uploading ${progress}%` : attached ? "Replace" : "Choose file"}
      </label>
      <input
        id={id}
        type="file"
        accept={accept}
        disabled={busy}
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Reset so picking the same file twice still fires a change event.
          e.target.value = "";
          if (file) onPick(file);
        }}
      />
      {busy && (
        <div
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${label} upload progress`}
          className="mt-2 h-2 w-full overflow-hidden rounded-full bg-band"
        >
          <div
            className="h-full rounded-full bg-primary transition-[width]"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
      <p className="mt-1 text-xs text-ink-faint">{hint}</p>
    </div>
  );
}

/* ============================================================
   Episode row
   ============================================================ */

function EpisodeRow({
  episode,
  index,
  total,
  onChanged,
  onMove,
  onDelete,
}: {
  episode: AdminEpisode;
  index: number;
  total: number;
  onChanged: () => void;
  onMove: (index: number, delta: number) => void;
  onDelete: (episode: AdminEpisode) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(episode.title);
  const [description, setDescription] = useState(episode.description ?? "");
  const [isPreview, setIsPreview] = useState(episode.is_preview);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyKind, setBusyKind] = useState<UploadKind | null>(null);
  const [progress, setProgress] = useState(0);

  /** Re-reads the row into the edit fields, so the panel always opens current. */
  function openEditor() {
    setTitle(episode.title);
    setDescription(episode.description ?? "");
    setIsPreview(episode.is_preview);
    setError("");
    setEditing(true);
  }

  async function saveDetails() {
    if (!title.trim()) {
      setError("Give the episode a title.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api.patch(`/admin/episodes/${episode.id}`, {
        title: title.trim(),
        description: description.trim() === "" ? null : description.trim(),
        isPreview,
      });
      setEditing(false);
      setNotice("Episode saved.");
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  /** The full three-step flow for one episode asset. */
  async function upload(kind: UploadKind, file: File) {
    setError("");
    setNotice("");

    const invalid = validateFile(kind, file);
    if (invalid) {
      setError(invalid);
      return;
    }

    let durationSec: number | null = null;
    if (kind === "video") {
      try {
        const seconds = await readVideoDuration(file);
        if (seconds > MAX_EPISODE_DURATION_SEC) {
          setError(
            `That video is ${formatDuration(seconds)} long. Episodes must be ${MAX_EPISODE_DURATION_SEC} seconds (6 minutes) or shorter, so it was not uploaded. Trim it or split it across two episodes.`,
          );
          return;
        }
        durationSec = Math.round(seconds);
      } catch (err) {
        setError(errorMessage(err));
        return;
      }
    }

    setBusyKind(kind);
    setProgress(0);
    try {
      const key = await uploadToStorage(
        episode.topic_id,
        kind,
        file,
        mimeFor(kind, file),
        setProgress,
      );

      if (kind === "video") {
        await api.patch(`/admin/episodes/${episode.id}`, {
          videoS3Key: key,
          durationSec: durationSec ?? 0,
          uploadStatus: "ready",
        });
        setNotice(`Video attached (${formatDuration(durationSec ?? 0)}).`);
      } else if (kind === "captions") {
        await api.patch(`/admin/episodes/${episode.id}`, { captionsKey: key });
        setNotice("Captions attached. This topic can now be published.");
      } else {
        await api.patch(`/admin/episodes/${episode.id}`, { thumbnailKey: key });
        setNotice("Thumbnail attached.");
      }
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
      // Record the failure so the queue does not look pending forever.
      if (kind === "video") {
        try {
          await api.patch(`/admin/episodes/${episode.id}`, { uploadStatus: "failed" });
          onChanged();
        } catch {
          // The original error is the one worth showing.
        }
      }
    } finally {
      setBusyKind(null);
      setProgress(0);
    }
  }

  return (
    <li className={`${CARD} p-4 sm:p-5`}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex shrink-0 flex-col items-center gap-1">
          <button
            type="button"
            aria-label={`Move ${episode.title} up`}
            disabled={index === 0}
            onClick={() => onMove(index, -1)}
            className={ICON_BTN}
          >
            <ChevronUp className="size-4" aria-hidden="true" />
          </button>
          <span className="text-xs font-semibold tabular-nums text-ink-faint">{index + 1}</span>
          <button
            type="button"
            aria-label={`Move ${episode.title} down`}
            disabled={index === total - 1}
            onClick={() => onMove(index, 1)}
            className={ICON_BTN}
          >
            <ChevronDown className="size-4" aria-hidden="true" />
          </button>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="min-w-0 font-semibold">{episode.title}</h3>
            <UploadStatusBadge status={episode.upload_status} />
            {episode.has_captions ? (
              <Chip tone="success">Captions</Chip>
            ) : (
              <Chip tone="danger">No captions</Chip>
            )}
            {episode.is_preview && <Chip tone="primary">Free preview</Chip>}
            <span className="text-xs tabular-nums text-ink-faint">
              {formatDuration(episode.duration_sec)}
            </span>
          </div>
          {episode.description && (
            <p className="mt-1 text-sm leading-relaxed text-ink-muted">{episode.description}</p>
          )}
          {episode.upload_error && (
            <p className="mt-1 text-sm font-semibold text-danger">{episode.upload_error}</p>
          )}

          {/* ---- uploads ---- */}
          <div className="mt-4 flex flex-wrap gap-4">
            <UploadControl
              id={`video-${episode.id}`}
              label="Video"
              hint={`MP4 or MOV, up to 500 MB and ${MAX_EPISODE_DURATION_SEC} seconds.`}
              accept="video/mp4,video/quicktime,video/x-m4v"
              icon={<Film className="size-4" aria-hidden="true" />}
              attached={Boolean(episode.video_s3_key)}
              busy={busyKind === "video"}
              progress={progress}
              onPick={(file) => void upload("video", file)}
            />
            <UploadControl
              id={`captions-${episode.id}`}
              label="Captions (WebVTT)"
              hint="Required before the topic can be published."
              accept=".vtt,text/vtt"
              icon={<Captions className="size-4" aria-hidden="true" />}
              attached={episode.has_captions}
              busy={busyKind === "captions"}
              progress={progress}
              onPick={(file) => void upload("captions", file)}
            />
            <UploadControl
              id={`thumb-${episode.id}`}
              label="Episode thumbnail"
              hint="PNG, JPEG or WebP, up to 5 MB."
              accept="image/png,image/jpeg,image/webp"
              icon={<ImageIcon className="size-4" aria-hidden="true" />}
              attached={Boolean(episode.thumbnail_key)}
              busy={busyKind === "thumbnail"}
              progress={progress}
              onPick={(file) => void upload("thumbnail", file)}
            />
          </div>

          {error && <ErrorBox message={error} className="mt-4" />}
          {notice && (
            <p role="status" className="mt-3 text-sm font-semibold text-success">
              {notice}
            </p>
          )}

          {/* ---- inline edit ---- */}
          {editing && (
            <div className="mt-4 grid gap-4 border-t border-line pt-4">
              <div>
                <label htmlFor={`episode-title-${episode.id}`} className={LABEL}>
                  Title
                </label>
                <input
                  id={`episode-title-${episode.id}`}
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className={`${FIELD} mt-1.5`}
                />
              </div>
              <div>
                <label htmlFor={`episode-desc-${episode.id}`} className={LABEL}>
                  Description
                </label>
                <textarea
                  id={`episode-desc-${episode.id}`}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className={`${TEXTAREA} mt-1.5`}
                />
              </div>
              <label className="flex min-h-12 w-fit cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={isPreview}
                  onChange={(e) => setIsPreview(e.target.checked)}
                  className="size-5 accent-[var(--color-primary)]"
                />
                <span className="text-sm font-semibold">
                  Free preview - playable without a subscription
                </span>
              </label>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => void saveDetails()}
                  disabled={saving}
                  className={BTN_PRIMARY}
                >
                  {saving ? "Saving..." : "Save episode"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false);
                    setError("");
                  }}
                  className={BTN_SECONDARY}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 gap-1.5">
          <button
            type="button"
            onClick={() => (editing ? setEditing(false) : openEditor())}
            aria-expanded={editing}
            className={BTN_SECONDARY}
          >
            {editing ? "Close" : "Edit"}
          </button>
          <button
            type="button"
            aria-label={`Delete ${episode.title}`}
            title="Delete episode"
            onClick={() => onDelete(episode)}
            className={ICON_BTN_DANGER}
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </li>
  );
}

/* ============================================================
   Episode manager
   ============================================================ */

export function EpisodeManager({
  topicId,
  onCountChanged,
}: {
  topicId: string;
  onCountChanged: () => void;
}) {
  const episodes = useAsync<{ data: AdminEpisode[] }>(`episodes|${topicId}`, () =>
    api.get<{ data: AdminEpisode[] }>(`/admin/topics/${topicId}/episodes`),
  );

  const [newTitle, setNewTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");
  const [rowError, setRowError] = useState("");
  const [pendingDelete, setPendingDelete] = useState<AdminEpisode | null>(null);

  const rows = episodes.data?.data ?? [];

  function refresh() {
    episodes.reload();
    onCountChanged();
  }

  async function addEpisode() {
    if (!newTitle.trim()) {
      setAddError("Give the episode a title.");
      return;
    }
    setAdding(true);
    setAddError("");
    try {
      await api.post(`/admin/topics/${topicId}/episodes`, { title: newTitle.trim() });
      setNewTitle("");
      refresh();
    } catch (err) {
      setAddError(errorMessage(err));
    } finally {
      setAdding(false);
    }
  }

  async function move(index: number, delta: number) {
    const a = rows[index];
    const b = rows[index + delta];
    if (!a || !b) return;
    setRowError("");
    try {
      await api.patch(`/admin/episodes/${a.id}`, { sortOrder: b.sort_order });
      await api.patch(`/admin/episodes/${b.id}`, { sortOrder: a.sort_order });
      refresh();
    } catch (err) {
      setRowError(errorMessage(err));
    }
  }

  async function confirmDelete() {
    const target = pendingDelete;
    setPendingDelete(null);
    if (!target) return;
    setRowError("");
    try {
      await api.delete(`/admin/episodes/${target.id}`);
      refresh();
    } catch (err) {
      setRowError(errorMessage(err));
    }
  }

  return (
    <SectionCard
      id="episodes"
      title="Episodes"
      description="Learners watch these in order. Every episode needs captions before the topic can be published, and no single episode may run longer than 6 minutes."
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-60 flex-1">
          <label htmlFor="new-episode-title" className={LABEL}>
            Add a episode
          </label>
          <input
            id="new-episode-title"
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void addEpisode();
              }
            }}
            placeholder="What this episode covers"
            className={`${FIELD} mt-1.5`}
          />
        </div>
        <button
          type="button"
          onClick={() => void addEpisode()}
          disabled={adding}
          className={BTN_PRIMARY}
        >
          <Plus className="size-5" aria-hidden="true" />
          {adding ? "Adding..." : "Add episode"}
        </button>
      </div>
      {addError && <ErrorBox message={addError} className="mt-3" />}
      {rowError && <ErrorBox message={rowError} className="mt-3" />}

      <div className="mt-5">
        {episodes.error ? (
          <ErrorBox message={episodes.error} onRetry={episodes.reload} />
        ) : episodes.loading ? (
          <SkeletonRows rows={3} />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No episodes yet."
            hint="Add the first episode above, then upload its video and captions."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {rows.map((episode, i) => (
              <EpisodeRow
                key={episode.id}
                episode={episode}
                index={i}
                total={rows.length}
                onChanged={refresh}
                onMove={(index, delta) => void move(index, delta)}
                onDelete={setPendingDelete}
              />
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this episode?"
        description={
          <>
            <strong className="text-ink">{pendingDelete?.title}</strong> and its progress records
            are removed from the topic. The uploaded video file itself is kept in storage. This is
            written to the audit log.
          </>
        }
        confirmLabel="Delete episode"
        destructive
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </SectionCard>
  );
}

/* ============================================================
   Topic editor
   ============================================================ */

interface LinkRow {
  key: string;
  label: string;
  url: string;
}

let linkSeq = 0;
const nextLinkKey = () => `link-${(linkSeq += 1)}`;

export function TopicEditor({ topicId }: { topicId: string }) {
  const topic = useAsync<TopicDetail>(`topic|${topicId}`, () =>
    api.get<TopicDetail>(`/admin/topics/${topicId}`),
  );

  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState("");
  const [publishNotice, setPublishNotice] = useState("");

  const detail = topic.data;

  async function togglePublish() {
    if (!detail) return;
    setPublishing(true);
    setPublishError("");
    setPublishNotice("");
    const goingLive = detail.status !== "published";
    try {
      await api.post(
        `/admin/topics/${topicId}/${goingLive ? "publish" : "unpublish"}`,
        {},
      );
      setPublishNotice(goingLive ? "Topic published." : "Topic unpublished.");
      topic.reload();
    } catch (err) {
      // The 422 from /publish names exactly what is missing. Show it verbatim.
      setPublishError(errorMessage(err));
    } finally {
      setPublishing(false);
    }
  }

  if (topic.loading) {
    return (
      <div className="flex flex-col gap-6">
        <SkeletonRows rows={6} />
      </div>
    );
  }

  if (topic.error || !detail) {
    return (
      <div className="flex flex-col gap-6">
        <Link href="/admin/content" className={`${BTN_SECONDARY} w-fit`}>
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to content
        </Link>
        <ErrorBox
          message={topic.error ?? "That topic could not be loaded."}
          onRetry={topic.reload}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin/content" className={`${BTN_SECONDARY} w-fit`}>
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to content
      </Link>

      <PageHeader
        title={detail.title}
        description={`/${detail.slug} - ${num(detail.episode_count)} episode${detail.episode_count === 1 ? "" : "s"}, ${formatDuration(detail.total_duration_sec)} total runtime, ${num(detail.view_count)} views.`}
      >
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={detail.status} />
          <button
            type="button"
            onClick={() => void togglePublish()}
            disabled={publishing}
            className={detail.status === "published" ? BTN_SECONDARY : BTN_PRIMARY}
          >
            {publishing ? "Working..." : detail.status === "published" ? "Unpublish" : "Publish"}
          </button>
        </div>
      </PageHeader>

      {publishError && <ErrorBox message={publishError} />}
      <p role="status" aria-live="polite" className="min-h-6 text-sm font-semibold text-success">
        {publishNotice}
      </p>

      {/* ===== Episodes ===== */}
      <EpisodeManager topicId={topicId} onCountChanged={topic.reload} />

      {/* The form owns its own state, seeded once per topic. */}
      <TopicMetadataForm key={detail.id} detail={detail} onUpdated={topic.set} />
    </div>
  );
}

function TopicMetadataForm({
  detail,
  onUpdated,
}: {
  detail: TopicDetail;
  onUpdated: (topic: TopicDetail) => void;
}) {
  const topicId = detail.id;
  const categories = useAsync<{ data: AdminCategory[] }>("admin-categories", () =>
    api.get<{ data: AdminCategory[] }>("/admin/categories"),
  );

  const [title, setTitle] = useState(detail.title);
  const [slug, setSlug] = useState(detail.slug);
  const [subtitle, setSubtitle] = useState(detail.subtitle ?? "");
  const [excerpt, setExcerpt] = useState(detail.excerpt ?? "");
  const [body, setBody] = useState(detail.body ?? "");
  const [skillLevel, setSkillLevel] = useState<SkillLevel>(detail.skill_level);
  const [categoryIds, setCategoryIds] = useState<string[]>(() =>
    detail.categories.map((c) => c.id),
  );
  const [hashtags, setHashtags] = useState<string[]>(detail.hashtags);
  const [hashtagDraft, setHashtagDraft] = useState("");
  const [links, setLinks] = useState<LinkRow[]>(() =>
    detail.links.map((l) => ({ key: nextLinkKey(), label: l.label ?? "", url: l.url })),
  );
  const [isFree, setIsFree] = useState(detail.is_free);
  const [affiliateTool, setAffiliateTool] = useState(detail.affiliate_tool ?? "");
  const [affiliateUrl, setAffiliateUrl] = useState(detail.affiliate_url ?? "");
  const [isSponsored, setIsSponsored] = useState(detail.is_sponsored);
  const [sponsorName, setSponsorName] = useState(detail.sponsor_name ?? "");

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [notice, setNotice] = useState("");
  const [thumbBusy, setThumbBusy] = useState(false);
  const [thumbProgress, setThumbProgress] = useState(0);

  function toggleCategory(id: string) {
    setCategoryIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  }

  function commitHashtags(raw: string) {
    const parts = raw
      .split(",")
      .map((p) => p.trim().replace(/^#+/, "").toLowerCase())
      .filter(Boolean);
    if (parts.length === 0) return;
    setHashtags((prev) => Array.from(new Set([...prev, ...parts])));
    setHashtagDraft("");
  }

  async function save() {
    if (!title.trim()) {
      setSaveError("A title is required.");
      return;
    }
    if (categoryIds.length === 0) {
      setSaveError("Pick at least one category.");
      return;
    }
    setSaving(true);
    setSaveError("");
    setNotice("");
    try {
      const updated = await api.patch<TopicDetail>(`/admin/topics/${topicId}`, {
        title: title.trim(),
        slug: slug.trim() || slugify(title),
        subtitle: subtitle.trim() === "" ? null : subtitle.trim(),
        excerpt: excerpt.trim() === "" ? null : excerpt.trim(),
        body: body.trim() === "" ? null : body,
        skillLevel,
        categoryIds,
        hashtags,
        links: links
          .filter((l) => l.url.trim() !== "")
          .map((l) => ({ url: l.url.trim(), label: l.label.trim() === "" ? null : l.label.trim() })),
        isFree,
        affiliateTool: affiliateTool.trim() === "" ? null : affiliateTool.trim(),
        affiliateUrl: affiliateUrl.trim() === "" ? null : affiliateUrl.trim(),
        isSponsored,
        sponsorName: sponsorName.trim() === "" ? null : sponsorName.trim(),
      });
      onUpdated(updated);
      setNotice("Topic saved.");
    } catch (err) {
      setSaveError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function uploadThumbnail(file: File) {
    const invalid = validateFile("thumbnail", file);
    if (invalid) {
      setSaveError(invalid);
      return;
    }
    setThumbBusy(true);
    setThumbProgress(0);
    setSaveError("");
    try {
      const key = await uploadToStorage(topicId, "thumbnail", file, file.type, setThumbProgress);
      const updated = await api.patch<TopicDetail>(`/admin/topics/${topicId}`, {
        thumbnailKey: key,
      });
      onUpdated(updated);
      setNotice("Cover image updated.");
    } catch (err) {
      setSaveError(errorMessage(err));
    } finally {
      setThumbBusy(false);
      setThumbProgress(0);
    }
  }

  return (
    <>
      <p role="status" aria-live="polite" className="min-h-6 text-sm font-semibold text-success">
        {notice}
      </p>

      {/* ===== Metadata ===== */}
      <SectionCard id="basics" title="Basics">
        <div className="flex flex-col gap-5">
          <div>
            <label htmlFor="ce-title" className={LABEL}>
              Title <span className="text-danger">*</span>
            </label>
            <input
              id="ce-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={`${FIELD} mt-1.5`}
            />
          </div>
          <div>
            <label htmlFor="ce-slug" className={LABEL}>
              Slug
            </label>
            <input
              id="ce-slug"
              type="text"
              value={slug}
              onChange={(e) => setSlug(slugify(e.target.value))}
              aria-describedby="ce-slug-hint"
              className={`${FIELD} mt-1.5 font-mono text-sm`}
            />
            <p id="ce-slug-hint" className="mt-1 text-xs text-ink-faint">
              Changing this changes the public URL. The server keeps it unique.
            </p>
          </div>
          <div>
            <label htmlFor="ce-subtitle" className={LABEL}>
              Subtitle
            </label>
            <input
              id="ce-subtitle"
              type="text"
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              className={`${FIELD} mt-1.5`}
            />
          </div>
          <div>
            <label htmlFor="ce-excerpt" className={LABEL}>
              Excerpt
            </label>
            <input
              id="ce-excerpt"
              type="text"
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              maxLength={500}
              aria-describedby="ce-excerpt-hint"
              className={`${FIELD} mt-1.5`}
            />
            <p id="ce-excerpt-hint" className="mt-1 text-xs text-ink-faint">
              {excerpt.length}/500 - this is the line shown in the feed.
            </p>
          </div>
          <div>
            <label htmlFor="ce-body" className={LABEL}>
              Body (markdown)
            </label>
            <textarea
              id="ce-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={10}
              className={`${TEXTAREA} mt-1.5 font-mono`}
            />
          </div>
          <div className="max-w-xs">
            <label htmlFor="ce-level" className={LABEL}>
              Skill level
            </label>
            <select
              id="ce-level"
              value={skillLevel}
              onChange={(e) => setSkillLevel(e.target.value as SkillLevel)}
              className={`${FIELD} mt-1.5`}
            >
              <option value="basic">Basic</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </select>
          </div>
          <label className="flex min-h-12 w-fit cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={isFree}
              onChange={(e) => setIsFree(e.target.checked)}
              className="size-5 accent-[var(--color-primary)]"
            />
            <span className="text-sm font-semibold">
              Free topic - viewable without a subscription
            </span>
          </label>
        </div>
      </SectionCard>

      {/* ===== Cover image ===== */}
      <SectionCard
        id="cover"
        title="Cover image"
        description="Shown on the topic card in the feed."
      >
        <div className="flex flex-wrap items-start gap-4">
          {detail.thumbnail_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={detail.thumbnail_url}
              alt=""
              className="h-24 w-40 rounded-md border border-line object-cover"
            />
          ) : (
            <div className="flex h-24 w-40 items-center justify-center rounded-md border border-dashed border-line-strong bg-band text-xs text-ink-faint">
              No cover yet
            </div>
          )}
          <UploadControl
            id="topic-thumbnail"
            label="Upload a cover"
            hint="PNG, JPEG or WebP, up to 5 MB."
            accept="image/png,image/jpeg,image/webp"
            icon={<ImageIcon className="size-4" aria-hidden="true" />}
            attached={Boolean(detail.thumbnail_url)}
            busy={thumbBusy}
            progress={thumbProgress}
            onPick={(file) => void uploadThumbnail(file)}
          />
        </div>
      </SectionCard>

      {/* ===== Categories ===== */}
      <SectionCard
        id="categories"
        title="Categories"
        description="At least one, up to five. A topic cannot be published without one."
      >
        {categories.error ? (
          <ErrorBox message={categories.error} onRetry={categories.reload} />
        ) : categories.loading ? (
          <SkeletonRows rows={3} />
        ) : (
          <fieldset>
            <legend className="sr-only">Categories</legend>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {(categories.data?.data ?? []).map((cat) => {
                const checked = categoryIds.includes(cat.id);
                return (
                  <label
                    key={cat.id}
                    className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-md border px-3 py-2 transition-colors ${
                      checked
                        ? "border-primary bg-primary-soft"
                        : "border-line hover:border-line-strong"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleCategory(cat.id)}
                      className="size-5 shrink-0 accent-[var(--color-primary)]"
                    />
                    <span
                      aria-hidden="true"
                      className="size-3 shrink-0 rounded-full"
                      style={{ backgroundColor: cat.color_hex ?? "var(--color-line-strong)" }}
                    />
                    <span className="min-w-0 truncate text-sm font-medium">
                      {cat.name}
                      {!cat.is_active && (
                        <span className="ml-1 text-xs text-ink-faint">(inactive)</span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}
      </SectionCard>

      {/* ===== Hashtags ===== */}
      <SectionCard
        id="hashtags"
        title="Hashtags"
        description="Comma or Enter creates a chip. Everything is normalised to lowercase."
      >
        <label htmlFor="ce-hashtags" className={LABEL}>
          Add hashtags
        </label>
        <input
          id="ce-hashtags"
          type="text"
          value={hashtagDraft}
          onChange={(e) => setHashtagDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              commitHashtags(hashtagDraft);
            } else if (e.key === "Backspace" && hashtagDraft === "" && hashtags.length > 0) {
              setHashtags((prev) => prev.slice(0, -1));
            }
          }}
          onBlur={() => commitHashtags(hashtagDraft)}
          placeholder="privacy, compliance"
          className={`${FIELD} mt-1.5`}
        />
        {hashtags.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2">
            {hashtags.map((tag) => (
              <li key={tag}>
                <span className="inline-flex items-center gap-1 rounded-md bg-primary-soft py-1 pl-2.5 pr-1 text-sm font-semibold text-primary-strong">
                  #{tag}
                  <button
                    type="button"
                    aria-label={`Remove hashtag ${tag}`}
                    onClick={() => setHashtags((prev) => prev.filter((t) => t !== tag))}
                    className="inline-flex size-6 items-center justify-center rounded-md hover:bg-surface"
                  >
                    <X className="size-3.5" aria-hidden="true" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {/* ===== Links ===== */}
      <SectionCard
        id="links"
        title="Links"
        description={`Up to ${MAX_LINKS} resources shown under the topic.`}
      >
        <div className="flex flex-col gap-3">
          {links.map((row, i) => (
            <div key={row.key} className="flex flex-wrap items-end gap-2">
              <div className="min-w-45 flex-1">
                <label htmlFor={`ce-link-label-${row.key}`} className={LABEL}>
                  Label {i + 1}
                </label>
                <input
                  id={`ce-link-label-${row.key}`}
                  type="text"
                  value={row.label}
                  onChange={(e) =>
                    setLinks((prev) =>
                      prev.map((l) => (l.key === row.key ? { ...l, label: e.target.value } : l)),
                    )
                  }
                  className={`${FIELD} mt-1.5`}
                />
              </div>
              <div className="min-w-60 flex-2">
                <label htmlFor={`ce-link-url-${row.key}`} className={LABEL}>
                  URL {i + 1}
                </label>
                <input
                  id={`ce-link-url-${row.key}`}
                  type="url"
                  value={row.url}
                  onChange={(e) =>
                    setLinks((prev) =>
                      prev.map((l) => (l.key === row.key ? { ...l, url: e.target.value } : l)),
                    )
                  }
                  placeholder="https://"
                  className={`${FIELD} mt-1.5`}
                />
              </div>
              <button
                type="button"
                aria-label={`Remove link ${i + 1}`}
                onClick={() => setLinks((prev) => prev.filter((l) => l.key !== row.key))}
                className={ICON_BTN}
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() =>
            setLinks((prev) => [...prev, { key: nextLinkKey(), label: "", url: "" }])
          }
          disabled={links.length >= MAX_LINKS}
          className={`${BTN_SECONDARY} mt-3`}
        >
          <Plus className="size-4" aria-hidden="true" />
          Add link
        </button>
        <p className="mt-2 text-xs text-ink-faint">
          {links.length}/{MAX_LINKS} rows used.
        </p>
      </SectionCard>

      {/* ===== Disclosure ===== */}
      <SectionCard
        id="disclosure"
        title="Affiliate and sponsorship"
        description="Anything set here renders an automatic disclosure line to every learner. The server rewrites the disclosure from these fields on save."
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="ce-affiliate-tool" className={LABEL}>
              Affiliate tool
            </label>
            <input
              id="ce-affiliate-tool"
              type="text"
              value={affiliateTool}
              onChange={(e) => setAffiliateTool(e.target.value)}
              placeholder="Notion AI"
              className={`${FIELD} mt-1.5`}
            />
          </div>
          <div>
            <label htmlFor="ce-affiliate-url" className={LABEL}>
              Affiliate URL
            </label>
            <input
              id="ce-affiliate-url"
              type="url"
              value={affiliateUrl}
              onChange={(e) => setAffiliateUrl(e.target.value)}
              placeholder="https://"
              className={`${FIELD} mt-1.5`}
            />
          </div>
        </div>

        <label className="mt-5 flex min-h-12 w-fit cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={isSponsored}
            onChange={(e) => setIsSponsored(e.target.checked)}
            className="size-5 accent-[var(--color-primary)]"
          />
          <span className="font-semibold">This topic is sponsored</span>
        </label>

        {isSponsored && (
          <div className="mt-3 max-w-sm">
            <label htmlFor="ce-sponsor" className={LABEL}>
              Sponsor name
            </label>
            <input
              id="ce-sponsor"
              type="text"
              value={sponsorName}
              onChange={(e) => setSponsorName(e.target.value)}
              className={`${FIELD} mt-1.5`}
            />
          </div>
        )}

        {detail.disclosure_text && (
          <div className="mt-5 rounded-md border border-streak/30 bg-streak-soft p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-streak">
              Disclosure currently shown to learners
            </p>
            <p className="mt-2 text-sm leading-relaxed text-ink">{detail.disclosure_text}</p>
          </div>
        )}
      </SectionCard>

      {/* ===== Save ===== */}
      <div className={`${CARD} p-5 sm:p-6`}>
        {saveError && <ErrorBox message={saveError} className="mb-4" />}
        <p className="mb-4 flex items-start gap-2 text-xs leading-relaxed text-ink-faint">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          Publishing needs at least one category, at least one episode, and captions on every
          episode. The publish button will name anything that is still missing.
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className={BTN_PRIMARY}
          >
            {saving ? "Saving..." : "Save changes"}
          </button>
          <Link href="/admin/content" className={BTN_SECONDARY}>
            Cancel
          </Link>
        </div>
      </div>
    </>
  );
}
