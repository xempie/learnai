"use client";

import Link from "next/link";
import { Lock, PlayCircle, PlaySquare } from "lucide-react";
import { formatClock } from "@/components/content-card";

/**
 * The episode list, with the honest version of what the viewer can watch.
 *
 * Locking is decided by the API (`locked` / `lock_reason` per episode, plus a
 * `preview` block describing the allowance) and only rendered here. A locked
 * row is deliberately not a link: sending a keyboard user to a page that only
 * says "no" is worse than telling them here.
 */

export interface EpisodeListItem {
  id: string;
  title: string;
  description?: string | null;
  duration_sec: number;
  is_preview?: boolean;
  locked?: boolean;
  lock_reason?: string | null;
}

export interface PreviewInfo {
  unlocked_episodes: number | "all";
  preview_limit: number;
  total_episodes: number;
}

export interface EpisodeListProps {
  topicSlug: string;
  episodes: EpisodeListItem[];
  /** Absent when the API has not sent a preview block. */
  preview?: PreviewInfo | null;
  /** Highlighted as the episode currently loaded in the player. */
  activeEpisodeId?: string | null;
}

/**
 * `lock_reason` is a machine code, not copy. Known codes get a sentence;
 * anything unrecognised is left out rather than shown raw - the lock icon and
 * the banner already say what is going on.
 */
const LOCK_REASON_TEXT: Record<string, string> = {
  entitlement_required: "Subscribe to watch this episode.",
  preview_limit: "Past the free preview. Subscribe to watch this episode.",
  preview_limit_reached: "Past the free preview. Subscribe to watch this episode.",
  trial_limit: "Past the episodes included with your trial.",
  signed_out: "Sign in and subscribe to watch this episode.",
  not_published: "Not published yet.",
  processing: "This episode is still being prepared.",
};

function lockReasonText(reason?: string | null): string | null {
  if (!reason) return null;
  return LOCK_REASON_TEXT[reason] ?? null;
}

/** "Episodes 1-2 are included..." - built from the API numbers, never guessed. */
function bannerText(preview: PreviewInfo): string {
  const total = preview.total_episodes;
  const unlocked = preview.unlocked_episodes;
  const open = typeof unlocked === "number" ? unlocked : 0;
  const totalLabel = `all ${total} episode${total === 1 ? "" : "s"}`;

  if (open <= 0) {
    return `Subscribe to unlock ${totalLabel}.`;
  }
  if (open === 1) {
    return `Episode 1 is included with your plan. Subscribe to unlock ${totalLabel}.`;
  }
  return `Episodes 1-${open} are included with your plan. Subscribe to unlock ${totalLabel}.`;
}

function Row({
  episode,
  index,
  active,
}: {
  episode: EpisodeListItem;
  index: number;
  active: boolean;
}) {
  const locked = episode.locked === true;
  const reason = locked ? lockReasonText(episode.lock_reason) : null;

  return (
    <span className="flex min-h-14 w-full items-center gap-3 py-3">
      {locked ? (
        <span
          aria-hidden="true"
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-band"
        >
          <Lock className="size-4 text-ink-faint" />
        </span>
      ) : (
        <span
          aria-hidden="true"
          className={`flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular-nums ${
            active ? "bg-primary text-on-primary" : "bg-band text-ink-muted"
          }`}
        >
          {index + 1}
        </span>
      )}

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={`font-semibold ${locked ? "text-ink-faint" : "text-ink"}`}>
            {episode.title}
          </span>
          {episode.is_preview && (
            <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary-strong">
              Preview
            </span>
          )}
          {locked && <span className="sr-only">Locked</span>}
        </span>
        {episode.description && (
          <span
            className={`mt-0.5 block text-sm ${locked ? "text-ink-faint" : "text-ink-muted"}`}
          >
            {episode.description}
          </span>
        )}
        {reason && <span className="mt-0.5 block text-sm text-ink-faint">{reason}</span>}
      </span>

      <span className="shrink-0 text-sm font-medium tabular-nums text-ink-faint">
        {formatClock(episode.duration_sec)}
      </span>

      {!locked && (
        <PlayCircle
          className="size-5 shrink-0 text-ink-faint group-hover:text-primary-strong"
          aria-hidden="true"
        />
      )}
    </span>
  );
}

export function EpisodeList({
  topicSlug,
  episodes,
  preview,
  activeEpisodeId,
}: EpisodeListProps) {
  if (episodes.length === 0) return null;

  /**
   * A topic is one 5-minute video unless it needs more than one. With a single
   * episode the player above IS the content, so a one-row "Episodes" list is
   * noise - render nothing and let the page read as a plain video.
   */
  if (episodes.length === 1) return null;

  const limited = preview != null && preview.unlocked_episodes !== "all";

  return (
    <section
      aria-labelledby="episodes-heading"
      className="rounded-card border border-line bg-surface p-5 shadow-xs"
    >
      <h2 id="episodes-heading" className="flex items-center gap-2 font-semibold">
        <PlaySquare className="size-5 text-primary-strong" aria-hidden="true" />
        Episodes
        <span className="font-normal text-ink-faint">({episodes.length})</span>
      </h2>

      {limited && preview && (
        <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-line bg-band px-4 py-3 text-sm text-ink-muted">
          <Lock className="size-4 shrink-0 text-ink-faint" aria-hidden="true" />
          <span className="min-w-0">{bannerText(preview)}</span>
          <Link
            href="/settings#subscription"
            className="inline-flex min-h-11 items-center font-semibold text-primary-strong hover:text-primary"
          >
            See plans
          </Link>
        </p>
      )}

      <ol className="mt-3 flex flex-col divide-y divide-line">
        {episodes.map((episode, index) => {
          const locked = episode.locked === true;
          return (
            <li key={episode.id}>
              {locked ? (
                <span
                  aria-disabled="true"
                  className="flex cursor-not-allowed opacity-70"
                  title={lockReasonText(episode.lock_reason) ?? "Subscribe to unlock this episode"}
                >
                  <Row episode={episode} index={index} active={false} />
                </span>
              ) : (
                <Link
                  href={`/content/${topicSlug}?episode=${encodeURIComponent(episode.id)}#topic-player`}
                  className="group flex"
                >
                  <Row
                    episode={episode}
                    index={index}
                    active={activeEpisodeId === episode.id}
                  />
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
