"use client";

import { useState } from "react";
import { Captions, Check, Film, Image as ImageIcon, Info } from "lucide-react";
import { api } from "@/lib/api-client";
import { MarkdownBody } from "@/components/markdown-body";
import {
  BTN_PRIMARY,
  CARD,
  ErrorBox,
  LABEL,
  MAX_EPISODE_DURATION_SEC,
  MAX_VIDEO_BYTES,
  SectionCard,
  SkeletonRows,
  TEXTAREA,
  errorMessage,
  formatDuration,
  useAsync,
} from "./admin-ui";

/* ============================================================
   API shape - the intro fields on GET/PATCH /admin/topics/:id
   ============================================================ */

/**
 * Every field is optional: this panel ships alongside the API that adds them,
 * so a topic record without them must render as "nothing uploaded yet"
 * rather than crash or invent a value.
 */
export interface TopicExtrasDetail {
  id: string;
  title: string;
  intro_video_key?: string | null;
  intro_captions_key?: string | null;
  intro_thumbnail_key?: string | null;
  intro_duration_sec?: number | null;
  why_learn?: string | null;
  outcomes?: string | null;
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

/* ============================================================
   Upload plumbing - presign, direct upload, then attach the key
   ============================================================ */

/** XHR rather than fetch: only XHR reports upload progress. */
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

/** Reads duration client-side so an over-long file is never uploaded at all. */
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

async function uploadToStorage(
  topicId: string,
  kind: UploadKind,
  file: File,
  mimeType: string,
  onProgress: (pct: number) => void,
): Promise<string> {
  const descriptor = await api.post<UploadDescriptor>(`/admin/topics/${topicId}/upload-url`, {
    kind,
    mimeType,
    sizeBytes: file.size,
    filename: file.name,
  });
  await putFile(descriptor, file, onProgress);
  return descriptor.key;
}

function validateFile(kind: UploadKind, file: File): string | null {
  if (kind === "video") {
    if (!VIDEO_MIME.includes(file.type)) return "The intro must be an MP4 or MOV file.";
    if (file.size > MAX_VIDEO_BYTES) return "The intro exceeds the 500 MB limit.";
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
   Upload control
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
   The panel
   ============================================================ */

function ExtrasForm({
  detail,
  onUpdated,
}: {
  detail: TopicExtrasDetail;
  onUpdated: (topic: TopicExtrasDetail) => void;
}) {
  const topicId = detail.id;

  const [whyLearn, setWhyLearn] = useState(detail.why_learn ?? "");
  const [outcomes, setOutcomes] = useState(detail.outcomes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyKind, setBusyKind] = useState<UploadKind | null>(null);
  const [progress, setProgress] = useState(0);

  const introDuration = detail.intro_duration_sec ?? 0;

  async function saveCopy() {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const updated = await api.patch<TopicExtrasDetail>(`/admin/topics/${topicId}`, {
        whyLearn: whyLearn.trim() === "" ? null : whyLearn,
        outcomes: outcomes.trim() === "" ? null : outcomes,
      });
      onUpdated(updated);
      setNotice("Intro copy saved.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

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
            `That video is ${formatDuration(seconds)} long. The intro must be ${MAX_EPISODE_DURATION_SEC} seconds (6 minutes) or shorter, so it was not uploaded. Trim it and try again.`,
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
        topicId,
        kind,
        file,
        kind === "captions" ? "text/vtt" : file.type,
        setProgress,
      );

      const patch =
        kind === "video"
          ? { introVideoKey: key, introDurationSec: durationSec ?? 0 }
          : kind === "captions"
            ? { introCaptionsKey: key }
            : { introThumbnailKey: key };

      const updated = await api.patch<TopicExtrasDetail>(`/admin/topics/${topicId}`, patch);
      onUpdated(updated);
      setNotice(
        kind === "video"
          ? `Intro video attached (${formatDuration(durationSec ?? 0)}).`
          : kind === "captions"
            ? "Intro captions attached."
            : "Intro thumbnail attached.",
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyKind(null);
      setProgress(0);
    }
  }

  return (
    <SectionCard
      id="topic-intro"
      title="Topic intro and outcomes"
      description="The intro video plays free for everyone, including trial accounts and signed out visitors. Keep it short and make the case for the topic."
    >
      <p role="status" aria-live="polite" className="min-h-6 text-sm font-semibold text-success">
        {notice}
      </p>

      {error && <ErrorBox message={error} className="mb-4" />}

      {/* ---- uploads ---- */}
      <div className="flex flex-wrap gap-4">
        <UploadControl
          id="intro-video"
          label="Intro video"
          hint={`MP4 or MOV, up to 500 MB and ${MAX_EPISODE_DURATION_SEC} seconds.`}
          accept="video/mp4,video/quicktime,video/x-m4v"
          icon={<Film className="size-4" aria-hidden="true" />}
          attached={Boolean(detail.intro_video_key)}
          busy={busyKind === "video"}
          progress={progress}
          onPick={(file) => void upload("video", file)}
        />
        <UploadControl
          id="intro-captions"
          label="Intro captions (WebVTT)"
          hint="Same accessibility bar as a episode - add them."
          accept=".vtt,text/vtt"
          icon={<Captions className="size-4" aria-hidden="true" />}
          attached={Boolean(detail.intro_captions_key)}
          busy={busyKind === "captions"}
          progress={progress}
          onPick={(file) => void upload("captions", file)}
        />
        <UploadControl
          id="intro-thumbnail"
          label="Intro poster image"
          hint="PNG, JPEG or WebP, up to 5 MB."
          accept="image/png,image/jpeg,image/webp"
          icon={<ImageIcon className="size-4" aria-hidden="true" />}
          attached={Boolean(detail.intro_thumbnail_key)}
          busy={busyKind === "thumbnail"}
          progress={progress}
          onPick={(file) => void upload("thumbnail", file)}
        />
      </div>

      <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-ink-faint">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        {detail.intro_video_key
          ? `Intro attached${introDuration > 0 ? ` - ${formatDuration(introDuration)}` : ""}. Uploading again replaces it.`
          : "No intro video yet. The topic page shows the copy below on its own until one is attached."}
      </p>

      {/* ---- copy ---- */}
      <div className="mt-6 grid gap-6">
        <div>
          <label htmlFor="ce-why-learn" className={LABEL}>
            Why take this topic (markdown)
          </label>
          <textarea
            id="ce-why-learn"
            value={whyLearn}
            onChange={(e) => setWhyLearn(e.target.value)}
            rows={6}
            aria-describedby="ce-why-learn-hint"
            className={`${TEXTAREA} mt-1.5 font-mono`}
          />
          <p id="ce-why-learn-hint" className="mt-1 text-xs text-ink-faint">
            Supported: ### headings, **bold**, *italic* and - bullet lists.
          </p>
          {whyLearn.trim() !== "" && (
            <div className={`${CARD} mt-3 p-4`}>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
                Preview
              </p>
              <MarkdownBody source={whyLearn} className="mt-2" />
            </div>
          )}
        </div>

        <div>
          <label htmlFor="ce-outcomes" className={LABEL}>
            Outcomes (one per line, as a bullet list)
          </label>
          <textarea
            id="ce-outcomes"
            value={outcomes}
            onChange={(e) => setOutcomes(e.target.value)}
            rows={6}
            aria-describedby="ce-outcomes-hint"
            placeholder={"- Spot the three categories that must never be pasted\n- Write a policy your team will follow"}
            className={`${TEXTAREA} mt-1.5 font-mono`}
          />
          <p id="ce-outcomes-hint" className="mt-1 text-xs text-ink-faint">
            Each bullet renders as a ticked outcome on the topic page.
          </p>
          {outcomes.trim() !== "" && (
            <div className={`${CARD} mt-3 p-4`}>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
                Preview
              </p>
              <MarkdownBody source={outcomes} className="mt-2" />
            </div>
          )}
        </div>
      </div>

      <div className="mt-6">
        <button
          type="button"
          onClick={() => void saveCopy()}
          disabled={saving}
          className={BTN_PRIMARY}
        >
          {saving ? "Saving..." : "Save intro copy"}
        </button>
      </div>
    </SectionCard>
  );
}

export function TopicExtras({ topicId }: { topicId: string }) {
  const topic = useAsync<TopicExtrasDetail>(`topic-extras|${topicId}`, () =>
    api.get<TopicExtrasDetail>(`/admin/topics/${topicId}`),
  );

  if (topic.loading) {
    return (
      <SectionCard id="topic-intro-loading" title="Topic intro and outcomes">
        <SkeletonRows rows={4} />
      </SectionCard>
    );
  }

  if (topic.error || !topic.data) {
    return (
      <SectionCard id="topic-intro-error" title="Topic intro and outcomes">
        <ErrorBox
          message={topic.error ?? "The intro settings could not be loaded."}
          onRetry={topic.reload}
        />
      </SectionCard>
    );
  }

  // Seeded once per topic; the form owns its own draft state after that.
  return <ExtrasForm key={topic.data.id} detail={topic.data} onUpdated={topic.set} />;
}
