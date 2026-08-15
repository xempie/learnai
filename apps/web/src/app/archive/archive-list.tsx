"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  CalendarDaysIcon,
  CircleCheckBigIcon,
  LockIcon,
  NewspaperIcon,
  VideoIcon,
  Wand2Icon,
} from "@/components/icons";
import { UpgradeSheet } from "@/components/upgrade-sheet";
import { VerticalFilterChips, useVerticalFilter } from "@/components/vertical-filter-chips";
import { COMPLETED_EDITIONS_KEY, defaultCompletedEditionDates } from "@/lib/completed-editions";
import type { Vertical } from "@/lib/sample-data";
import { usePersistedState } from "@/lib/use-persisted-state";
import { verticalLabel } from "@/lib/verticals";

export interface ArchiveEditionSummary {
  id: string;
  editionDate: string;
  headline: string;
  vertical: Vertical;
  locked: boolean;
}

function monthKey(isoDate: string): string {
  return isoDate.slice(0, 7); // "2026-08"
}

function monthLabel(isoDate: string): string {
  return new Intl.DateTimeFormat("en-AU", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${isoDate}T00:00:00Z`),
  );
}

function dayLabel(isoDate: string): string {
  return new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(`${isoDate}T00:00:00Z`),
  );
}

export function ArchiveList({ editions }: { editions: ArchiveEditionSummary[] }) {
  const [vertical, setVertical] = useVerticalFilter();
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [completed] = usePersistedState<string[]>(
    COMPLETED_EDITIONS_KEY,
    defaultCompletedEditionDates(editions.map((edition) => edition.editionDate)),
  );

  const filtered = useMemo(
    () => (vertical === "all" ? editions : editions.filter((edition) => edition.vertical === vertical)),
    [editions, vertical],
  );

  const groups = useMemo(() => {
    const byMonth = new Map<string, ArchiveEditionSummary[]>();
    for (const edition of filtered) {
      const key = monthKey(edition.editionDate);
      const list = byMonth.get(key) ?? [];
      list.push(edition);
      byMonth.set(key, list);
    }
    return [...byMonth.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [filtered]);

  const hasLocked = filtered.some((edition) => edition.locked);

  return (
    <div className="space-y-6">
      <VerticalFilterChips value={vertical} onChange={setVertical} />

      {hasLocked && (
        <div className="flex items-center justify-between gap-4 rounded-card border border-accent/30 bg-accent/10 px-4 py-3">
          <p className="text-sm text-foreground">
            <span className="font-semibold">Free plan:</span> editions older than 7 days are locked.
          </p>
          <button
            type="button"
            onClick={() => setUpgradeOpen(true)}
            className="shrink-0 cursor-pointer rounded-control bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary transition-colors duration-200 hover:bg-primary-hover"
          >
            Upgrade
          </button>
        </div>
      )}

      {groups.length === 0 ? (
        <div className="rounded-card border border-dashed border-line bg-surface p-8 text-center">
          <CalendarDaysIcon size={28} className="mx-auto mb-3 text-muted" />
          <p className="font-heading text-lg font-medium text-foreground">No editions in this vertical</p>
          <p className="mt-1 text-sm text-muted">Try a different filter, or select &ldquo;All&rdquo;.</p>
        </div>
      ) : (
        groups.map(([month, monthEditions]) => (
          <section key={month}>
            <h2 className="mb-2 text-sm font-semibold tracking-wide text-muted uppercase">
              {monthLabel(monthEditions[0]!.editionDate)}
            </h2>
            <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
              {monthEditions.map((edition) => {
                const done = completed.includes(edition.editionDate);
                const content = (
                  <>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-xs text-muted">
                        <span className="tabular-nums">{dayLabel(edition.editionDate)}</span>
                        <span aria-hidden="true">&middot;</span>
                        <span>{verticalLabel(edition.vertical)}</span>
                      </div>
                      <p className="mt-0.5 truncate font-heading text-base font-medium text-foreground sm:text-[1.05rem]">
                        {edition.headline}
                      </p>
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <span
                          className="inline-flex items-center gap-1 rounded-control bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary"
                          title="News"
                        >
                          <NewspaperIcon size={11} />
                        </span>
                        <span
                          className="inline-flex items-center gap-1 rounded-control bg-accent/10 px-1.5 py-0.5 text-[11px] font-medium text-accent"
                          title="Technique"
                        >
                          <Wand2Icon size={11} />
                        </span>
                        <span
                          className="inline-flex items-center gap-1 rounded-control bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary"
                          title="Video"
                        >
                          <VideoIcon size={11} />
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0">
                      {edition.locked ? (
                        <span className="inline-flex items-center gap-1 rounded-control border border-line px-2 py-1 text-xs font-medium text-muted">
                          <LockIcon size={13} />
                          Locked
                        </span>
                      ) : done ? (
                        <span
                          className="inline-flex items-center gap-1 text-success"
                          aria-label="Completed"
                          title="Completed"
                        >
                          <CircleCheckBigIcon size={20} />
                        </span>
                      ) : null}
                    </div>
                  </>
                );

                if (edition.locked) {
                  return (
                    <li key={edition.id}>
                      <button
                        type="button"
                        onClick={() => setUpgradeOpen(true)}
                        className="flex w-full cursor-pointer items-center gap-3 px-4 py-3.5 text-left opacity-70 transition-colors duration-200 hover:bg-line/40"
                      >
                        {content}
                      </button>
                    </li>
                  );
                }

                return (
                  <li key={edition.id}>
                    <Link
                      href={`/briefs/${edition.editionDate}`}
                      className="flex cursor-pointer items-center gap-3 px-4 py-3.5 transition-colors duration-200 hover:bg-line/40"
                    >
                      {content}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}

      <UpgradeSheet
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        reason="Editions older than 7 days are part of Learn AI Premium."
      />
    </div>
  );
}
