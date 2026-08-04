import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  ArrowLeft,
  Clock3,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Info,
  Lock,
  Megaphone,
  Paperclip,
  PlaySquare,
  Video as VideoIcon,
} from "lucide-react";
import { CommentsSection } from "@/components/comments-section";
import { formatCount, formatPublishDate, formatRuntime } from "@/components/content-card";
import { TopicIntro } from "@/components/topic-intro";
import { TopicResources } from "@/components/topic-resources";
import { EngagementBar } from "@/components/engagement-bar";
import { EpisodeList, type EpisodeListItem, type PreviewInfo } from "@/components/episode-list";
import { MarkdownBody } from "@/components/markdown-body";
import { VideoPlayer } from "@/components/video-player";

/** Topic data is per-viewer (entitlement) and changes constantly. */
export const dynamic = "force-dynamic";

/* ============================================================
   API SHAPE - GET /api/v1/topics/[idOrSlug] (serialiseTopicDetail)
   ============================================================ */

interface ApiEpisode {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  sort_order: number;
  duration_sec: number;
  is_preview: boolean;
  has_captions: boolean;
  upload_status: string;
  thumbnail_url: string | null;
  /** Sent once the preview allowance shipped; absent on older responses. */
  locked?: boolean;
  lock_reason?: string | null;
}

interface ApiTopicDetail {
  id: string;
  type: string;
  slug: string;
  title: string;
  subtitle: string | null;
  body: string | null;
  excerpt: string | null;
  thumbnail_url: string | null;
  skill_level: string;
  episode_count: number;
  total_duration_sec: number;
  view_count: number;
  like_count: number;
  comment_count: number;
  bookmark_count: number;
  rating_count: number;
  rating_avg: number | null;
  author_name: string | null;
  published_at: string | null;
  is_free: boolean;
  status: string;
  episodes: ApiEpisode[];
  links: { id: string; url: string; label: string | null }[];
  attachments: { id: string; filename: string; mime_type: string; size_bytes: number }[];
  hashtags: string[];
  categories: { id: string; slug: string; name: string; color_hex: string }[];
  affiliate_tool: string | null;
  affiliate_url: string | null;
  is_sponsored: boolean;
  sponsor_name: string | null;
  disclosure_text: string | null;
  entitlement: { allowed: boolean; reason: string };
  /* ---- intro, preview allowance and resources ---- */
  has_intro?: boolean;
  intro_duration_sec?: number | null;
  why_learn?: string | null;
  outcomes?: string | null;
  preview?: PreviewInfo | null;
  resource_count?: number;
}

/**
 * Server-side fetch through the public API rather than the query layer, so the
 * page sees exactly what a client would - including the entitlement decision,
 * which is resolved from the forwarded session cookie.
 */
async function fetchTopic(slug: string): Promise<ApiTopicDetail | null> {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const cookie = (await cookies()).toString();

  const res = await fetch(`${base}/api/v1/topics/${encodeURIComponent(slug)}`, {
    headers: cookie ? { cookie } : {},
    cache: "no-store",
  });

  if (res.status === 404) return null;
  if (!res.ok) return null;
  return (await res.json()) as ApiTopicDetail;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const topic = await fetchTopic(slug);
  return { title: topic?.title ?? "Content" };
}

/** Human-readable file size, 1000-based (matches how the data is authored). */
function formatBytes(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`;
  const kb = bytes / 1000;
  if (kb < 1000) return `${Math.round(kb)} KB`;
  const mb = kb / 1000;
  return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1)} MB`;
}

function fileLabel(mime: string): string {
  if (mime === "application/pdf") return "PDF document";
  if (mime.includes("wordprocessingml") || mime === "application/msword") return "Word document";
  if (mime.includes("spreadsheetml") || mime === "application/vnd.ms-excel")
    return "Excel spreadsheet";
  if (mime.includes("presentationml")) return "PowerPoint deck";
  if (mime.startsWith("image/")) return "Image";
  if (mime.startsWith("text/")) return "Text file";
  return "File";
}

/**
 * `locked` is the API's decision. Until it ships that field, fall back to the
 * rule this page already used - entitled viewers see everything, everyone else
 * sees the episodes marked as previews - rather than guessing an allowance.
 */
function isLocked(episode: ApiEpisode, allowed: boolean): boolean {
  if (typeof episode.locked === "boolean") return episode.locked;
  return !allowed && !episode.is_preview;
}

export default async function ContentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ episode?: string | string[] }>;
}) {
  const { slug } = await params;
  const { episode: episodeParam } = await searchParams;
  const topic = await fetchTopic(slug);
  if (!topic) notFound();

  const isVideo = topic.type !== "article";
  const episodes = [...topic.episodes].sort((a, b) => a.sort_order - b.sort_order);
  const allowed = topic.entitlement.allowed;
  const hasCaptions = episodes.some((l) => l.has_captions);

  const unlockedEpisodes = episodes.filter((l) => !isLocked(l, allowed));

  // The episode list links here with ?episode=<id>. A locked or unknown id falls
  // back to the first episode the viewer may actually watch.
  const requestedId = Array.isArray(episodeParam) ? episodeParam[0] : episodeParam;
  const requested = requestedId
    ? unlockedEpisodes.find((l) => l.id === requestedId)
    : undefined;
  const openingEpisode = requested ?? unlockedEpisodes[0];

  const episodeItems: EpisodeListItem[] = episodes.map((episode) => ({
    id: episode.id,
    title: episode.title,
    description: episode.description,
    duration_sec: episode.duration_sec,
    is_preview: episode.is_preview,
    locked: isLocked(episode, allowed),
    lock_reason: episode.lock_reason ?? null,
  }));

  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <nav aria-label="Breadcrumb">
        <Link
          href="/feed"
          className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-ink-muted hover:text-primary-strong"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to feed
        </Link>
      </nav>

      {/* Sponsorship disclosure - prominent, before the content (spec §4.3) */}
      {topic.is_sponsored && (
        <aside
          aria-label="Sponsorship disclosure"
          className="flex items-start gap-3 rounded-card border border-line bg-streak-soft px-4 py-3 shadow-xs"
        >
          <Megaphone className="mt-0.5 size-5 shrink-0 text-streak" aria-hidden="true" />
          <p className="font-semibold text-streak">
            Sponsored by {topic.sponsor_name ?? "a partner"}.{" "}
            <span className="font-normal">
              This episode was paid for. We still choose what goes in it.
            </span>
          </p>
        </aside>
      )}

      {/* Affiliate disclosure - persistent and above the fold, never a tooltip */}
      {topic.affiliate_tool && (
        <aside
          aria-label="Affiliate disclosure"
          className="flex items-start gap-3 rounded-card border border-line bg-surface px-4 py-3 text-sm shadow-xs"
        >
          <Info className="mt-0.5 size-4 shrink-0 text-ink-faint" aria-hidden="true" />
          <p className="text-ink-muted">
            {topic.disclosure_text ? (
              <>{topic.disclosure_text} </>
            ) : (
              <>
                This {isVideo ? "video" : "article"} contains an affiliate link for{" "}
                <strong className="text-ink">{topic.affiliate_tool}</strong>. We may earn a
                commission if you subscribe - it never changes what we recommend.{" "}
              </>
            )}
            {topic.affiliate_url && (
              <a
                href={topic.affiliate_url}
                target="_blank"
                rel="noopener noreferrer sponsored"
                className="inline-flex items-center gap-1 font-semibold text-primary-strong"
              >
                Try {topic.affiliate_tool}
                <ExternalLink className="size-3.5" aria-hidden="true" />
              </a>
            )}
          </p>
        </aside>
      )}

      {/* ===== Player, or the upgrade panel when nothing is unlocked ===== */}
      {isVideo && (
        <div id="topic-player" className="scroll-mt-6">
          {openingEpisode ? (
            <>
              <VideoPlayer
                topicId={topic.id}
                episodeId={openingEpisode.id}
                durationSec={openingEpisode.duration_sec}
                posterUrl={openingEpisode.thumbnail_url ?? topic.thumbnail_url}
              />
              <p className="mt-2 text-sm text-ink-faint">Now playing: {openingEpisode.title}</p>
            </>
          ) : (
            <section
              aria-label="Subscription required"
              className="flex flex-col items-center gap-3 rounded-card border border-line bg-band px-6 py-10 text-center shadow-xs"
            >
              <span className="flex size-12 items-center justify-center rounded-md bg-primary-soft">
                <Lock className="size-6 text-primary-strong" aria-hidden="true" />
              </span>
              <h2 className="text-lg font-semibold text-ink">This topic is for subscribers</h2>
              <p className="max-w-md text-ink-muted">
                Start a free trial or subscribe to watch all {topic.episode_count} episodes. The
                episode list, notes and comments below stay open either way.
              </p>
              <Link
                href="/settings?tab=billing"
                className="inline-flex min-h-12 items-center rounded-md bg-primary px-6 font-semibold text-on-primary hover:bg-primary-strong"
              >
                See plans
              </Link>
            </section>
          )}
        </div>
      )}

      <header>
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm font-medium text-ink-faint">
          <li className="inline-flex items-center gap-1.5 font-semibold text-primary-strong">
            {isVideo ? (
              <VideoIcon className="size-4" aria-hidden="true" />
            ) : (
              <FileText className="size-4" aria-hidden="true" />
            )}
            {isVideo ? "Video" : "Article"}
          </li>
          {topic.author_name && <li>{topic.author_name}</li>}
          {topic.published_at && (
            <li>
              <time dateTime={topic.published_at}>{formatPublishDate(topic.published_at)}</time>
            </li>
          )}
          {isVideo && topic.episode_count > 0 && (
            <li className="inline-flex items-center gap-1.5">
              <PlaySquare className="size-4" aria-hidden="true" />
              {topic.episode_count} episode{topic.episode_count === 1 ? "" : "s"}
            </li>
          )}
          {isVideo && topic.total_duration_sec > 0 && (
            <li className="inline-flex items-center gap-1.5">
              <Clock3 className="size-4" aria-hidden="true" />
              {formatRuntime(topic.total_duration_sec)}
            </li>
          )}
          <li className="inline-flex items-center gap-1.5">
            <Eye className="size-4" aria-hidden="true" />
            {formatCount(topic.view_count)} views
          </li>
          {isVideo && hasCaptions && <li>Captions available</li>}
        </ul>

        <h1 className="mt-3 text-2xl font-semibold sm:text-3xl">{topic.title}</h1>
        {topic.subtitle && <p className="mt-2 text-lg text-ink-muted">{topic.subtitle}</p>}

        <ul className="mt-4 flex flex-wrap items-center gap-2">
          {topic.categories.map((category) => (
            <li key={category.id}>
              <Link
                href="/feed"
                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-surface px-4 text-sm font-semibold text-ink-muted hover:border-primary hover:text-primary-strong"
              >
                <span
                  aria-hidden="true"
                  className="size-2 rounded-full"
                  style={{ background: category.color_hex }}
                />
                {category.name}
              </Link>
            </li>
          ))}
        </ul>
      </header>

      {/* ===== Why take this topic - intro video, why-learn, outcomes ===== */}
      <TopicIntro
        topicId={topic.id}
        hasIntro={topic.has_intro === true}
        introDurationSec={topic.intro_duration_sec ?? null}
        whyLearn={topic.why_learn ?? null}
        outcomes={topic.outcomes ?? null}
        posterUrl={topic.thumbnail_url}
      />

      {/* ===== Body ===== */}
      {topic.body && (
        <div className="rounded-card border border-line bg-surface p-5 shadow-xs sm:p-6">
          {isVideo ? (
            <p className="leading-relaxed text-ink-muted">{topic.body}</p>
          ) : (
            <MarkdownBody source={topic.body} />
          )}
        </div>
      )}

      {/* ===== Episodes ===== */}
      <EpisodeList
        topicSlug={topic.slug}
        episodes={episodeItems}
        preview={topic.preview ?? null}
        activeEpisodeId={openingEpisode?.id ?? null}
      />

      {/* ===== Resources ===== */}
      <TopicResources topicId={topic.id} />

      {/* ===== Hashtags ===== */}
      {topic.hashtags.length > 0 && (
        <section aria-labelledby="tags-heading">
          <h2 id="tags-heading" className="sr-only">
            Tags
          </h2>
          <ul className="flex flex-wrap gap-2">
            {topic.hashtags.map((tag) => (
              <li
                key={tag}
                className="rounded-full border border-line bg-surface px-3 py-1 text-sm font-semibold text-ink-muted"
              >
                #{tag}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ===== Links ===== */}
      {topic.links.length > 0 && (
        <section
          aria-labelledby="links-heading"
          className="rounded-card border border-line bg-surface p-5 shadow-xs"
        >
          <h2 id="links-heading" className="font-semibold">
            Links
          </h2>
          <ul className="mt-2 flex flex-col divide-y divide-line">
            {topic.links.map((link) => (
              <li key={link.id}>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-12 items-center gap-2 py-2 font-semibold text-ink-muted hover:text-primary-strong"
                >
                  <ExternalLink className="size-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1">{link.label ?? link.url}</span>
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ===== Attachments ===== */}
      {topic.attachments.length > 0 && (
        <section
          aria-labelledby="attachments-heading"
          className="rounded-card border border-line bg-surface p-5 shadow-xs"
        >
          <h2 id="attachments-heading" className="flex items-center gap-2 font-semibold">
            <Paperclip className="size-5 text-primary-strong" aria-hidden="true" />
            Attachments
          </h2>
          <ul className="mt-3 flex flex-col gap-2">
            {topic.attachments.map((attachment) => (
              <li
                key={attachment.id}
                className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-band px-4 py-3"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-ink">
                    {attachment.filename}
                  </span>
                  <span className="block text-sm text-ink-faint">
                    {fileLabel(attachment.mime_type)} · {formatBytes(attachment.size_bytes)}
                  </span>
                </span>
                {/* No download route yet - signed attachment URLs land later. */}
                <span
                  title="Downloads are not wired up yet"
                  className="inline-flex min-h-11 shrink-0 cursor-not-allowed items-center gap-2 rounded-md border border-line bg-band px-4 text-sm font-semibold text-ink-faint"
                >
                  <Download className="size-4" aria-hidden="true" />
                  Download
                  <span className="sr-only">{attachment.filename} (unavailable)</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <EngagementBar
        topicId={topic.id}
        liked={false}
        likeCount={topic.like_count}
        bookmarked={false}
        bookmarkCount={topic.bookmark_count}
      />

      <CommentsSection topicId={topic.id} initialCount={topic.comment_count} />
    </article>
  );
}
