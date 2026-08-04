import Link from "next/link";
import { Clock3, Eye, FileText, Play, PlaySquare, Video as VideoIcon } from "lucide-react";

/* ============================================================
   API SHAPES (snake_case, exactly as the routes serialise them)
   ============================================================ */

/** `serialiseCategoryRef` - the trimmed category attached to a topic. */
export interface ApiCategoryRef {
  id: string;
  slug: string;
  name: string;
  color_hex: string;
}

/**
 * `serialiseCard` (GET /feed) and the list serialiser (GET /topics).
 *
 * The two differ: /topics adds `categories` and `author_name`, /feed adds
 * `href`, the engagement counters and the viewer's `liked`/`bookmarked`. The
 * union is modelled with optionals so one card renders both.
 */
export interface ApiTopicCard {
  id: string;
  type: string;
  slug: string;
  href?: string;
  title: string;
  subtitle?: string | null;
  excerpt: string | null;
  thumbnail_url: string | null;
  skill_level: string;
  episode_count: number;
  total_duration_sec: number;
  view_count: number;
  like_count?: number;
  comment_count?: number;
  bookmark_count?: number;
  is_free: boolean;
  is_sponsored?: boolean;
  sponsor_name?: string | null;
  affiliate_tool?: string | null;
  disclosure_text?: string | null;
  published_at: string | null;
  liked?: boolean;
  bookmarked?: boolean;
  /** Only on GET /topics - the feed card omits it. */
  categories?: ApiCategoryRef[];
  /** Only on GET /topics - the feed card omits it. */
  author_name?: string | null;
}

/** Prototype "now" - the fake data is authored around this instant. */
export const NOW_ISO = "2026-08-02T06:00:00Z";

/** "2 days ago" from an ISO string, relative to NOW_ISO. */
export function relativeTime(iso?: string): string {
  if (!iso) return "Unpublished";

  const then = Date.parse(iso);
  const now = Date.parse(NOW_ISO);
  if (Number.isNaN(then)) return "Unpublished";

  const seconds = Math.round((now - then) / 1000);
  if (seconds < 60) return "Just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;

  const weeks = Math.floor(days / 7);
  if (days < 30) return `${weeks} week${weeks === 1 ? "" : "s"} ago`;

  const months = Math.floor(days / 30);
  if (days < 365) return `${months} month${months === 1 ? "" : "s"} ago`;

  const years = Math.floor(days / 365);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

/** Absolute publish date, e.g. "14 July 2026". Locale-independent so SSR matches. */
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function formatPublishDate(iso?: string): string {
  if (!iso) return "Not published";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Not published";
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** m:ss */
export function formatClock(seconds?: number): string {
  if (!seconds || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Topic run time as "1h 20m" / "24m", for totals rather than a single clip. */
export function formatRuntime(seconds?: number): string {
  if (!seconds || seconds < 0) return "0m";
  const totalMinutes = Math.round(seconds / 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** Thousands separators without relying on the runtime locale. */
export function formatCount(n: number): string {
  const sign = n < 0 ? "-" : "";
  const digits = String(Math.abs(Math.round(n)));
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Accepts either the API's category objects (`categories`) or the older
 * id-list form (`categoryIds`), which other views still pass. Same markup
 * either way.
 */
export function CategoryChips({
  categories,
  className = "",
}: {
  categories?: ApiCategoryRef[];
  className?: string;
}) {
  const resolved: ApiCategoryRef[] = categories ?? [];

  if (resolved.length === 0) return null;

  return (
    <ul className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {resolved.map((category) => (
        <li
          key={category.id}
          className="inline-flex items-center gap-1.5 rounded-full border border-line bg-band px-2.5 py-0.5 text-xs font-semibold text-ink-muted"
        >
          <span
            aria-hidden="true"
            className="size-2 rounded-full"
            style={{ background: category.color_hex }}
          />
          {category.name}
        </li>
      ))}
    </ul>
  );
}

function TypeBadge({ isVideo }: { isVideo: boolean }) {
  const Icon = isVideo ? VideoIcon : FileText;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-semibold text-primary-strong">
      <Icon className="size-3.5" aria-hidden="true" />
      {isVideo ? "Video" : "Article"}
    </span>
  );
}

/**
 * Adapter for the marketing homepage, which still renders the authored sample
 * data. Everything else passes an `ApiTopicCard` straight from the API.
 */
type ContentCardProps = {
  className?: string;
  /** Title only - no excerpt. Used on the marketing homepage. */
  compact?: boolean;
} & { topic: ApiTopicCard };

export function ContentCard(props: ContentCardProps) {
  const { className = "", compact = false } = props;
  const { topic } = props;

  const isVideo = topic.type !== "article";
  const firstColor = topic.categories?.[0]?.color_hex ?? "#1e40af";
  const thumbStyle = topic.thumbnail_url
    ? {
        background: `url(${topic.thumbnail_url}) center / cover no-repeat, ${firstColor}`,
      }
    : { background: firstColor };

  return (
    <Link href={`/content/${topic.slug}`} className="group block h-full w-full rounded-card">
      <article
        className={`flex h-full flex-col rounded-card border border-line bg-surface p-4 shadow-xs transition-shadow duration-150 group-hover:shadow-md ${className}`}
      >
        {isVideo && (
          <div
            className="relative aspect-video w-full overflow-hidden rounded-md"
            style={thumbStyle}
            aria-hidden="true"
          >
            <span className="absolute left-1/2 top-1/2 flex size-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/15">
              <Play className="size-6 text-white" fill="currentColor" />
            </span>
            <span className="absolute bottom-2 right-2 rounded bg-ink/80 px-1.5 py-0.5 text-xs font-semibold text-white">
              {topic.episode_count > 0
                ? `${topic.episode_count} videos`
                : formatClock(topic.total_duration_sec)}
            </span>
          </div>
        )}

        <div className={isVideo ? "mt-3" : ""}>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            {/* Type badge only matters once articles share the listing again. */}
            {!isVideo && <TypeBadge isVideo={isVideo} />}
            {topic.author_name && (
              <>
                <span className="text-xs font-semibold text-ink-faint">{topic.author_name}</span>
                <span aria-hidden="true" className="text-xs text-ink-faint">
                  ·
                </span>
              </>
            )}
            <span className="text-xs font-medium text-ink-faint">
              {relativeTime(topic.published_at ?? undefined)}
            </span>
            {topic.is_sponsored && (
              <span className="rounded-full bg-streak-soft px-2 py-0.5 text-xs font-semibold text-streak">
                Sponsored
              </span>
            )}
            {topic.affiliate_tool && (
              <span className="rounded-full border border-line px-2 py-0.5 text-xs font-semibold text-ink-faint">
                Affiliate link
              </span>
            )}
          </div>

          <h3 className="mt-2 line-clamp-2 font-display text-base font-semibold text-ink group-hover:text-primary-strong sm:text-lg">
            {topic.title}
          </h3>

          {!compact && topic.excerpt && (
            <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-ink-muted">
              {topic.excerpt}
            </p>
          )}

          <CategoryChips categories={topic.categories} className="mt-3" />

          <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-medium text-ink-faint">
            {topic.episode_count > 0 && (
              <li className="inline-flex items-center gap-1.5">
                <PlaySquare className="size-4" aria-hidden="true" />
                {topic.episode_count} videos
              </li>
            )}
            {topic.total_duration_sec > 0 && (
              <li className="inline-flex items-center gap-1.5">
                <Clock3 className="size-4" aria-hidden="true" />
                {formatRuntime(topic.total_duration_sec)}
              </li>
            )}
            <li className="inline-flex items-center gap-1.5">
              <Eye className="size-4" aria-hidden="true" />
              {formatCount(topic.view_count)} views
            </li>
          </ul>
        </div>
      </article>
    </Link>
  );
}

/** Card-shaped placeholder for first load. Pulse honours prefers-reduced-motion. */
export function ContentCardSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="flex h-full w-full animate-pulse flex-col rounded-card border border-line bg-surface p-4 shadow-xs"
    >
      <div className="aspect-video w-full rounded-md bg-band" />
      <div className="mt-3 h-3 w-24 rounded bg-band" />
      <div className="mt-3 h-4 w-full rounded bg-band" />
      <div className="mt-2 h-4 w-4/5 rounded bg-band" />
      <div className="mt-3 h-3 w-2/3 rounded bg-band" />
      <div className="mt-3 h-3 w-1/2 rounded bg-band" />
    </div>
  );
}
