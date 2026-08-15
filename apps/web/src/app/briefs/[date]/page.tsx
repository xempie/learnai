import Link from "next/link";
import type { Metadata } from "next";
import { BriefLockedGate } from "@/app/briefs/[date]/locked-gate";
import { ArrowLeftIcon, CalendarDaysIcon, ClockIcon } from "@/components/icons";
import { NewsCard } from "@/components/daily-brief/news-card";
import { TechniqueCard } from "@/components/daily-brief/technique-card";
import { VideoCard } from "@/components/daily-brief/video-card";
import { getContentSource, getCurrentUser, getEditionByDate, getEditions } from "@/lib/data-source";
import { formatEditionDate } from "@/lib/format";

const FREE_WINDOW_DAYS = 7;

function splitDate(iso: string): [number, number, number] {
  const [year, month, day] = iso.split("-").map(Number);
  return [year!, month! - 1, day!];
}

function daysBetween(a: string, b: string): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((Date.UTC(...splitDate(a)) - Date.UTC(...splitDate(b))) / msPerDay);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ date: string }>;
}): Promise<Metadata> {
  const { date } = await params;
  const edition = await getEditionByDate(date);
  return { title: edition ? `${edition.headline} · Learn AI` : "Edition not found · Learn AI" };
}

/**
 * `/briefs/[date]` — a past edition, rendered with the same brief layout
 * as `/` (LEARN_AI_V1_BUILD_SPEC.md §7). Free users hit the 7-day window
 * gate (§8, §12 T15) for anything older.
 */
export default async function BriefByDatePage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  const [edition, user, editions] = await Promise.all([
    getEditionByDate(date),
    getCurrentUser(),
    getEditions(),
  ]);

  if (!edition) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
        <div className="rounded-card border border-dashed border-line bg-surface p-8 text-center">
          <CalendarDaysIcon size={28} className="mx-auto mb-3 text-muted" />
          <h1 className="font-heading text-xl font-semibold text-foreground">Edition not found</h1>
          <p className="mt-1 text-sm text-muted">There&apos;s no Learn AI edition for {date}.</p>
          <Link
            href="/archive"
            className="mt-4 inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-primary hover:text-primary-hover"
          >
            <ArrowLeftIcon size={15} />
            Back to archive
          </Link>
        </div>
      </div>
    );
  }

  const today = editions[0]?.editionDate;
  const locked = user.tier === "free" && !!today && daysBetween(today, edition.editionDate) >= FREE_WINDOW_DAYS;

  if (locked) {
    return <BriefLockedGate editionDate={edition.editionDate} headline={edition.headline} />;
  }

  const news = edition.items.find((item) => item.kind === "news");
  const technique = edition.items.find((item) => item.kind === "technique");
  const video = edition.items.find((item) => item.kind === "video");
  const newsSource = news?.sourceId ? await getContentSource(news.sourceId) : null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <Link
        href="/archive"
        className="mb-6 inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-muted transition-colors duration-200 hover:text-primary"
      >
        <ArrowLeftIcon size={15} />
        Back to archive
      </Link>

      <header className="mb-8">
        <p className="text-sm font-medium text-muted">{formatEditionDate(edition.editionDate)}</p>
        <h1 className="mt-2 font-heading text-2xl leading-tight font-semibold tracking-tight text-foreground sm:text-3xl">
          {edition.headline}
        </h1>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <span className="inline-flex items-center gap-1.5 text-sm text-muted">
            <ClockIcon size={15} />5 min read
          </span>
        </div>
      </header>

      <div className="space-y-6">
        {news && <NewsCard item={news} source={newsSource} />}
        {technique && <TechniqueCard item={technique} />}
        {video && <VideoCard item={video} />}
      </div>
    </div>
  );
}
