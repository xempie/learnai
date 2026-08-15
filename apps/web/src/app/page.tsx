import { ClockIcon } from "@/components/icons";
import { NewsCard } from "@/components/daily-brief/news-card";
import { TechniqueCard } from "@/components/daily-brief/technique-card";
import { VideoCard } from "@/components/daily-brief/video-card";
import { MarkDoneButton } from "@/components/daily-brief/mark-done-button";
import { DailyBriefEmptyState } from "@/components/daily-brief/skeletons";
import { getContentSource, getTodayEdition } from "@/lib/data-source";
import { formatEditionDate } from "@/lib/format";

/**
 * `/` — the daily brief (LEARN_AI_V1_BUILD_SPEC.md §1: one news item, one
 * technique, one five-minute video). UI Phase 1: reads only through
 * `lib/data-source.ts`, which serves sample data today.
 */
export default async function DailyBriefPage() {
  const edition = await getTodayEdition();

  if (!edition || edition.items.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
        <DailyBriefEmptyState />
      </div>
    );
  }

  const news = edition.items.find((item) => item.kind === "news");
  const technique = edition.items.find((item) => item.kind === "technique");
  const video = edition.items.find((item) => item.kind === "video");
  const newsSource = news?.sourceId ? await getContentSource(news.sourceId) : null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="mb-8">
        <p className="text-sm font-medium text-muted">{formatEditionDate(edition.editionDate)}</p>
        {/* The one place with the oversized editorial headline treatment. */}
        <h1 className="mt-2 font-heading text-4xl leading-[1.1] font-semibold tracking-tight text-foreground sm:text-5xl">
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

      <div className="mt-8 border-t border-line pt-6">
        <MarkDoneButton />
      </div>
    </div>
  );
}
