"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Clapperboard, Lock, RefreshCw, TriangleAlert } from "lucide-react";
import { ApiClientError, api } from "@/lib/api-client";

/**
 * Playback URLs are never embedded in the page: the entitlement check runs
 * inside POST /topics/:id/playback and only then is a URL signed. So the
 * player asks for one at mount and renders whatever the answer allows -
 * a stream, an upgrade panel, or a "still processing" notice.
 *
 * The topic intro ("why take this topic") uses the same shell in
 * `mode="intro"`: it posts to /topics/:id/intro, which needs no entitlement,
 * so that branch never renders an upgrade panel and never reports progress.
 */

interface PlaybackResponse {
  episode_id: string;
  playback_url: string;
  captions_url: string | null;
  duration_sec: number | null;
  expires_at: string;
  access_reason: string;
}

interface IntroResponse {
  playback_url: string;
  captions_url: string | null;
  duration_sec: number | null;
  thumbnail_url: string | null;
  expires_at: string;
}

/** The subset both endpoints agree on - all this component actually renders. */
interface PlayableSource {
  playback_url: string;
  captions_url: string | null;
  duration_sec: number | null;
  thumbnail_url: string | null;
}

interface ProgressBody {
  episodeId: string;
  positionSec: number;
  watchedPct: number;
}

type PlayerState =
  | { kind: "loading" }
  | { kind: "ready"; source: PlayableSource }
  | { kind: "locked"; message: string }
  | { kind: "signed-out"; message: string }
  | { kind: "processing"; message: string }
  | { kind: "error"; message: string };

type PlayerMode = "episode" | "intro";

const PROGRESS_INTERVAL_MS = 10_000;

const SHELL =
  "aspect-video w-full overflow-hidden rounded-card border border-line bg-ink shadow-md";
const PANEL =
  "flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-card border border-line bg-band px-6 text-center shadow-xs";

/** Normalises either endpoint's body, tolerating fields that are not sent. */
function toSource(payload: PlaybackResponse | IntroResponse): PlayableSource {
  return {
    playback_url: payload.playback_url,
    captions_url: payload.captions_url ?? null,
    duration_sec: payload.duration_sec ?? null,
    thumbnail_url: "thumbnail_url" in payload ? (payload.thumbnail_url ?? null) : null,
  };
}

/* ============================================================
   API-BACKED PLAYER
   ============================================================ */

function ApiVideoPlayer({
  mode,
  topicId,
  episodeId,
  durationSec,
  posterUrl,
}: {
  mode: PlayerMode;
  topicId: string;
  /** Null in intro mode - the intro is a property of the topic, not a episode. */
  episodeId: string | null;
  durationSec?: number | null;
  posterUrl?: string | null;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [attempt, setAttempt] = useState(0);

  const storageKey = `acadu:pos:${episodeId ?? `intro-${topicId}`}`;

  /* ---------------- resolve a signed source ---------------- */

  // One state cell tagged with the request it belongs to, so "loading" is
  // derived rather than written and the effect never calls setState
  // synchronously (react-hooks/set-state-in-effect).
  const requestKey = `${mode}|${topicId}|${episodeId ?? "intro"}#${attempt}`;
  const [result, setResult] = useState<{ key: string; state: PlayerState }>({
    key: "",
    state: { kind: "loading" },
  });

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const settle = (state: PlayerState) => {
        if (!cancelled) setResult({ key: requestKey, state });
      };

      try {
        if (mode === "intro") {
          const res = await api.post<IntroResponse>(`/topics/${topicId}/intro`, {});
          settle({ kind: "ready", source: toSource(res) });
          return;
        }
        const res = await api.post<PlaybackResponse>(`/topics/${topicId}/playback`, {
          episodeId,
        });
        settle({ kind: "ready", source: toSource(res) });
      } catch (err) {
        if (err instanceof ApiClientError) {
          if (err.code === "CONFLICT") {
            settle({ kind: "processing", message: err.message });
            return;
          }
          // The intro is free for everyone, so an entitlement or session error
          // there is a fault to report, never an upsell.
          if (mode === "episode" && err.code === "ENTITLEMENT_REQUIRED") {
            settle({ kind: "locked", message: err.message });
            return;
          }
          if (mode === "episode" && err.status === 401) {
            settle({ kind: "signed-out", message: err.message });
            return;
          }
          settle({ kind: "error", message: err.message });
          return;
        }
        settle({
          kind: "error",
          message:
            mode === "intro"
              ? "We could not start the intro video. Try again."
              : "We could not start this episode. Try again.",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [requestKey, mode, topicId, episodeId]);

  const state: PlayerState = result.key === requestKey ? result.state : { kind: "loading" };

  /* ---------------- progress reporting ---------------- */

  // Kept in refs so the timeupdate listener never has to be re-bound.
  const lastSentAt = useRef(0);
  const lastSent = useRef<ProgressBody | null>(null);
  const pending = useRef<ProgressBody | null>(null);

  const total = state.kind === "ready" ? (state.source.duration_sec ?? durationSec ?? 0) : 0;

  const sendProgress = useCallback(
    (body: ProgressBody) => {
      const previous = lastSent.current;
      if (
        previous &&
        previous.episodeId === body.episodeId &&
        previous.positionSec === body.positionSec
      ) {
        return;
      }
      lastSent.current = body;
      lastSentAt.current = Date.now();
      // Progress is best-effort telemetry - a failure must not break playback.
      void api.post(`/topics/${topicId}/progress`, body).catch(() => undefined);
    },
    [topicId],
  );

  useEffect(() => {
    if (state.kind !== "ready") return;
    const el = ref.current;
    if (!el) return;

    const saved = window.localStorage.getItem(storageKey);
    if (saved) {
      const pos = Number(saved);
      if (Number.isFinite(pos) && pos > 3) el.currentTime = pos;
    }

    let lastStored = 0;

    const snapshot = (): ProgressBody | null => {
      if (!episodeId) return null;
      const positionSec = Math.max(0, Math.floor(el.currentTime));
      const duration = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : total;
      const watchedPct =
        duration > 0 ? Math.min(100, Math.round((positionSec / duration) * 100)) : 0;
      return { episodeId, positionSec, watchedPct };
    };

    const onTime = () => {
      if (el.currentTime - lastStored > 3) {
        lastStored = el.currentTime;
        window.localStorage.setItem(storageKey, String(Math.floor(el.currentTime)));
      }
      const body = snapshot();
      if (!body) return;
      pending.current = body;
      if (Date.now() - lastSentAt.current >= PROGRESS_INTERVAL_MS) sendProgress(body);
    };

    const flush = () => {
      const body = pending.current ?? snapshot();
      if (body) sendProgress(body);
    };

    el.addEventListener("timeupdate", onTime);
    el.addEventListener("pause", flush);
    el.addEventListener("ended", flush);

    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("pause", flush);
      el.removeEventListener("ended", flush);
      if (pending.current) sendProgress(pending.current);
    };
  }, [state.kind, storageKey, episodeId, total, sendProgress]);

  /* ---------------- render ---------------- */

  const noun = mode === "intro" ? "the intro video" : "the episode";

  if (state.kind === "loading") {
    return (
      <div
        className={`${SHELL} animate-pulse bg-band`}
        role="status"
        aria-label={`Loading ${noun}`}
      />
    );
  }

  if (state.kind === "locked") {
    return (
      <section aria-label="Subscription required" className={PANEL}>
        <span className="flex size-12 items-center justify-center rounded-md bg-primary-soft">
          <Lock className="size-6 text-primary-strong" aria-hidden="true" />
        </span>
        <h2 className="text-lg font-semibold text-ink">This episode is for subscribers</h2>
        <p className="max-w-sm text-sm text-ink-muted">{state.message}</p>
        <Link
          href="/settings?tab=billing"
          className="inline-flex min-h-12 items-center rounded-md bg-primary px-6 font-semibold text-on-primary hover:bg-primary-strong"
        >
          See plans
        </Link>
      </section>
    );
  }

  if (state.kind === "signed-out") {
    return (
      <section aria-label="Sign in to watch" className={PANEL}>
        <span className="flex size-12 items-center justify-center rounded-md bg-primary-soft">
          <Lock className="size-6 text-primary-strong" aria-hidden="true" />
        </span>
        <h2 className="text-lg font-semibold text-ink">Sign in to watch this episode</h2>
        <p className="max-w-sm text-sm text-ink-muted">{state.message}</p>
        <Link
          href="/login"
          className="inline-flex min-h-12 items-center rounded-md bg-primary px-6 font-semibold text-on-primary hover:bg-primary-strong"
        >
          Sign in
        </Link>
      </section>
    );
  }

  if (state.kind === "processing") {
    return (
      <section aria-label="Video not ready" className={PANEL}>
        <span className="flex size-12 items-center justify-center rounded-md bg-primary-soft">
          <Clapperboard className="size-6 text-primary-strong" aria-hidden="true" />
        </span>
        <h2 className="text-lg font-semibold text-ink">
          {mode === "intro"
            ? "The intro video is being prepared"
            : "This episode's video is being prepared"}
        </h2>
        <p className="max-w-sm text-sm text-ink-muted">
          It will play here as soon as processing finishes. Everything else on this page is ready
          to read now.
        </p>
      </section>
    );
  }

  if (state.kind === "error") {
    return (
      <section aria-label="Playback error" className={PANEL}>
        <span className="flex size-12 items-center justify-center rounded-md bg-streak-soft">
          <TriangleAlert className="size-6 text-streak" aria-hidden="true" />
        </span>
        <h2 className="text-lg font-semibold text-ink">
          {mode === "intro"
            ? "We could not start the intro video"
            : "We could not start this episode"}
        </h2>
        <p className="max-w-sm text-sm text-ink-muted">{state.message}</p>
        <button
          type="button"
          onClick={() => setAttempt((n) => n + 1)}
          className="inline-flex min-h-12 items-center gap-2 rounded-md border border-line bg-surface px-4 font-semibold text-ink hover:border-primary hover:text-primary-strong"
        >
          <RefreshCw className="size-4" aria-hidden="true" />
          Try again
        </button>
      </section>
    );
  }

  return (
    <video
      ref={ref}
      controls
      preload="metadata"
      playsInline
      poster={state.source.thumbnail_url ?? posterUrl ?? undefined}
      src={state.source.playback_url}
      className="aspect-video w-full rounded-card border border-line bg-ink object-cover shadow-md"
      crossOrigin="anonymous"
    >
      {state.source.captions_url && (
        <track
          kind="captions"
          src={state.source.captions_url}
          srcLang="en"
          label="English"
          default
        />
      )}
      Your browser does not support HTML5 video.
    </video>
  );
}

type VideoPlayerProps =
  | {
      mode?: "episode";
      topicId: string;
      episodeId: string;
      durationSec?: number | null;
      posterUrl?: string | null;
      video?: never;
    }
  | {
      mode: "intro";
      topicId: string;
      episodeId?: never;
      durationSec?: number | null;
      posterUrl?: string | null;
      video?: never;
    }
;

export function VideoPlayer(props: VideoPlayerProps) {
  if (props.mode === "intro" && props.topicId) {
    return (
      <ApiVideoPlayer
        key={`intro-${props.topicId}`}
        mode="intro"
        topicId={props.topicId}
        episodeId={null}
        durationSec={props.durationSec}
        posterUrl={props.posterUrl}
      />
    );
  }
  if (props.topicId && props.episodeId) {
    return (
      <ApiVideoPlayer
        key={props.episodeId}
        mode="episode"
        topicId={props.topicId}
        episodeId={props.episodeId}
        durationSec={props.durationSec}
        posterUrl={props.posterUrl}
      />
    );
  }
  return null;
}
