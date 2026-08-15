import { CaptionsIcon, ClockIcon, PlayIcon, VideoIcon } from "@/components/icons";
import type { ContentItem } from "@/lib/sample-data";

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

/**
 * The player itself is Phase 2 — this card ships the poster, play
 * affordance, duration and captions indicator the spec asks for (§7).
 */
export function VideoCard({ item }: { item: ContentItem }) {
  return (
    <article className="rounded-card border border-line bg-surface p-6">
      <div className="mb-3 flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-control bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
          <VideoIcon size={14} />
          Video
        </span>
        {item.videoDurationS && (
          <span className="inline-flex items-center gap-1 text-xs text-muted">
            <ClockIcon size={13} />
            <span className="tabular-nums">{formatDuration(item.videoDurationS)}</span>
          </span>
        )}
        {item.videoCaptionsUrl && (
          <span className="inline-flex items-center gap-1 rounded-control border border-line px-2 py-0.5 text-xs text-muted">
            <CaptionsIcon size={13} />
            Captions on
          </span>
        )}
      </div>

      <h2 className="mb-3 font-heading text-xl font-semibold text-foreground sm:text-2xl">{item.title}</h2>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <button
          type="button"
          aria-label={`Play ${item.title}`}
          className="group relative aspect-[9/16] w-full max-w-[220px] shrink-0 cursor-pointer overflow-hidden rounded-control bg-linear-to-br from-primary to-[#0e2338] text-left transition-transform duration-200 hover:scale-[1.02]"
        >
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-surface/90 text-primary shadow-md transition-transform duration-200 group-hover:scale-105">
              <PlayIcon size={24} className="ml-0.5" />
            </span>
          </span>
          {item.videoDurationS && (
            <span className="absolute bottom-2 right-2 rounded bg-black/60 px-1.5 py-0.5 text-xs font-medium text-white tabular-nums">
              {formatDuration(item.videoDurationS)}
            </span>
          )}
        </button>

        <p className="max-w-prose text-[0.975rem] leading-relaxed text-foreground">{item.summary}</p>
      </div>
    </article>
  );
}
