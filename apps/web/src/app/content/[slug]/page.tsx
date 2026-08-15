import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowLeftIcon,
  ClockIcon,
  NewspaperIcon,
  VideoIcon,
  Wand2Icon,
} from "@/components/icons";
import { CopyButton } from "@/components/daily-brief/copy-button";
import { VerticalVideoPlayer } from "@/components/video-player";
import {
  getContentItemBySlug,
  getContentSource,
  getEditionForContentItem,
} from "@/lib/data-source";
import { formatEditionDate } from "@/lib/format";
import { Prose, splitFencedBlock } from "@/lib/markdown-lite";
import type { ContentKind } from "@/lib/sample-data";
import { parseVideoScript } from "@/lib/video-script";
import { verticalLabel } from "@/lib/verticals";

const KIND_META: Record<ContentKind, { label: string; Icon: typeof NewspaperIcon }> = {
  news: { label: "News", Icon: NewspaperIcon },
  technique: { label: "Technique", Icon: Wand2Icon },
  video: { label: "Video", Icon: VideoIcon },
  prompt: { label: "Prompt", Icon: Wand2Icon },
};

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const item = await getContentItemBySlug(slug);
  return { title: item ? `${item.title} · Learn AI` : "Not found · Learn AI" };
}

/**
 * `/content/[slug]` — single content item page. News/technique render
 * `body_md` at a 65-75ch reading measure; video renders the vertical
 * player (§7) with timestamped script sections below.
 */
export default async function ContentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const item = await getContentItemBySlug(slug);

  if (!item) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
        <div className="rounded-card border border-dashed border-line bg-surface p-8 text-center">
          <h1 className="font-heading text-xl font-semibold text-foreground">Content not found</h1>
          <p className="mt-1 text-sm text-muted">This item may have been moved or unpublished.</p>
          <Link
            href="/search"
            className="mt-4 inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-primary hover:text-primary-hover"
          >
            <ArrowLeftIcon size={15} />
            Search Learn AI
          </Link>
        </div>
      </div>
    );
  }

  const [edition, source] = await Promise.all([
    getEditionForContentItem(item),
    item.sourceId ? getContentSource(item.sourceId) : Promise.resolve(null),
  ]);
  const meta = KIND_META[item.kind];

  const backHref = edition ? `/briefs/${edition.editionDate}` : "/archive";

  if (item.kind === "video") {
    const cues = parseVideoScript(item.bodyMd);

    return (
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
        <Link
          href={backHref}
          className="mb-6 inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-muted transition-colors duration-200 hover:text-primary"
        >
          <ArrowLeftIcon size={15} />
          Back to the brief
        </Link>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-control bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
            <meta.Icon size={14} />
            {meta.label}
          </span>
          {edition && <span className="text-xs text-muted">{formatEditionDate(edition.editionDate)}</span>}
          <span className="text-xs text-muted">{verticalLabel(item.vertical)}</span>
          {item.videoDurationS && (
            <span className="ml-auto inline-flex items-center gap-1 rounded-control border border-line px-2 py-0.5 text-xs text-muted">
              <ClockIcon size={12} />
              <span className="tabular-nums">{formatDuration(item.videoDurationS)}</span>
            </span>
          )}
        </div>

        <h1 className="mb-5 font-heading text-2xl font-semibold text-foreground sm:text-3xl">{item.title}</h1>

        <VerticalVideoPlayer title={item.title} durationS={item.videoDurationS ?? 0} cues={cues} />

        <div className="mx-auto mt-8 max-w-[70ch]">
          <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted uppercase">Script</h2>
          <ol className="space-y-3">
            {cues.map((cue) => (
              <li key={cue.timeS} className="flex gap-3 text-[0.975rem] leading-[1.6]">
                <span className="shrink-0 pt-0.5 text-xs font-medium text-accent tabular-nums">
                  {formatDuration(cue.timeS)}
                </span>
                <span className="text-foreground">{cue.text}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    );
  }

  const { before, code, after } = item.kind === "technique" ? splitFencedBlock(item.bodyMd) : { before: item.bodyMd, code: null, after: "" };

  return (
    <article className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <Link
        href={backHref}
        className="mb-6 inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-muted transition-colors duration-200 hover:text-primary"
      >
        <ArrowLeftIcon size={15} />
        Back to the brief
      </Link>

      <div className="mx-auto max-w-[70ch]">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-control bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
            <meta.Icon size={14} />
            {meta.label}
          </span>
          {edition && <span className="text-xs text-muted">{formatEditionDate(edition.editionDate)}</span>}
          <span className="text-xs text-muted">{verticalLabel(item.vertical)}</span>
          {source && (
            <span className="text-xs text-muted">
              Source: <span className="font-medium text-foreground">{source.name}</span>
            </span>
          )}
        </div>

        <h1 className="mb-5 font-heading text-2xl leading-tight font-semibold text-foreground sm:text-3xl">
          {item.title}
        </h1>

        <Prose text={before} className="space-y-4 text-base leading-[1.6] text-foreground" />

        {code && (
          <div className="mt-5 overflow-hidden rounded-control border border-line bg-background">
            <div className="flex items-center justify-between border-b border-line px-3 py-2">
              <span className="text-xs font-medium text-muted">Prompt</span>
              <CopyButton text={code} />
            </div>
            <pre className="overflow-x-auto px-3 py-3 text-sm leading-relaxed text-foreground">
              <code>{code}</code>
            </pre>
          </div>
        )}

        {after && <Prose text={after} className="mt-5 space-y-4 text-base leading-[1.6] text-foreground" />}

        {item.sourceUrl && (
          <a
            href={item.sourceUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-6 inline-block cursor-pointer text-sm font-medium text-primary underline decoration-1 underline-offset-2 transition-colors duration-200 hover:text-primary-hover"
          >
            Read the source
          </a>
        )}
      </div>
    </article>
  );
}
