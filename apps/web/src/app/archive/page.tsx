import type { Metadata } from "next";
import { ArchiveList, type ArchiveEditionSummary } from "@/app/archive/archive-list";
import { getCurrentUser, getEditions } from "@/lib/data-source";

export const metadata: Metadata = {
  title: "Archive · Learn AI",
};

/** 7-day free window (LEARN_AI_V1_BUILD_SPEC.md §8, §12 T15): editions older than this many days are premium-only. */
const FREE_WINDOW_DAYS = 7;

function daysBetween(a: string, b: string): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((Date.UTC(...splitDate(a)) - Date.UTC(...splitDate(b))) / msPerDay);
}

function splitDate(iso: string): [number, number, number] {
  const [year, month, day] = iso.split("-").map(Number);
  return [year!, month! - 1, day!];
}

/**
 * `/archive` — LEARN_AI_V1_BUILD_SPEC.md §12 T15/T16: month-grouped edition
 * list, free-tier 7-day window gating, vertical filter that persists.
 * Server component fetches through `lib/data-source.ts`; the interactive
 * filter/gate UI lives in `ArchiveList` (client).
 */
export default async function ArchivePage() {
  const [editions, user] = await Promise.all([getEditions(), getCurrentUser()]);
  const today = editions[0]?.editionDate; // getEditions() is most-recent-first

  const summaries: ArchiveEditionSummary[] = editions.map((edition) => ({
    id: edition.id,
    editionDate: edition.editionDate,
    headline: edition.headline,
    vertical: edition.items[0]?.vertical ?? "general",
    locked: user.tier === "free" && !!today && daysBetween(today, edition.editionDate) >= FREE_WINDOW_DAYS,
  }));

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="mb-6">
        <h1 className="font-heading text-2xl font-semibold text-foreground sm:text-3xl">Archive</h1>
        <p className="mt-1 text-sm text-muted">Every past Learn AI edition, one brief per publishing day.</p>
      </header>

      <ArchiveList editions={summaries} />
    </div>
  );
}
