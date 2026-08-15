import type { Metadata } from "next";
import { ClaimCta } from "@/app/org/[slug]/claim-cta";
import { FlameIcon, UsersIcon } from "@/components/icons";
import { getColleagues, getEditions, getOrganisation } from "@/lib/data-source";
import type { Vertical } from "@/lib/sample-data";
import { verticalLabel } from "@/lib/verticals";

/**
 * `/org/[slug]` — LEARN_AI_V1_BUILD_SPEC.md §4.2 cohort page, restyled to
 * the design system for the UI-Phase-2 demo.
 *
 * SAMPLE-DATA ONLY, deliberately: the real page (T06, already shipped)
 * reads `GET /api/v1/org/:slug` via `apiFetch`, which requires a signed-in
 * session cookie — there is no session in this sample-data-only build
 * phase, so that version 401s for every visitor and can't be demoed. This
 * rewrite reads `lib/data-source.ts` instead, matching every other page in
 * this phase. The T06 acceptance tests (`route.test.ts`) exercise the API
 * route directly, not this page component, so they are unaffected.
 * `[slug]` is accepted per the route contract but sample data has exactly
 * one organisation, so it's the only one ever rendered here.
 */
export const metadata: Metadata = {
  title: "Cohort · Learn AI",
};

export default async function OrgPage() {
  const [organisation, colleagues, editions] = await Promise.all([
    getOrganisation(),
    getColleagues(),
    getEditions(),
  ]);

  const colleagueCount = organisation.memberCount - 1;
  const suppressed = organisation.memberCount < 3;

  // "Most-read vertical" derived from which vertical published most often
  // in the last 7 editions — a defensible proxy given the sample data has
  // no per-user completions table to aggregate from directly.
  const recentEditions = editions.slice(0, 7);
  const verticalCounts = new Map<Vertical, number>();
  for (const edition of recentEditions) {
    const vertical = edition.items[0]?.vertical;
    if (!vertical) continue;
    verticalCounts.set(vertical, (verticalCounts.get(vertical) ?? 0) + 1);
  }
  let mostReadVertical: Vertical | null = null;
  let mostReadCount = 0;
  for (const [vertical, count] of verticalCounts) {
    if (count > mostReadCount) {
      mostReadVertical = vertical;
      mostReadCount = count;
    }
  }

  // Illustrative weekly aggregate: each member's contribution capped at 5
  // (one per weekday) and summed across the visible cohort.
  const briefsCompletedThisWeek = colleagues.reduce((sum, c) => sum + Math.min(c.currentStreak, 5), 0);

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-8 sm:px-6 sm:py-12">
      <header>
        <p className="inline-flex items-center gap-1.5 text-sm font-medium text-muted">
          <UsersIcon size={15} />
          Cohort
        </p>
        <h1 className="mt-1 font-heading text-2xl font-semibold text-foreground sm:text-3xl">
          {organisation.name}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {organisation.memberCount} member{organisation.memberCount === 1 ? "" : "s"}
          {!suppressed && (
            <>
              {" "}
              &middot; You and {colleagueCount} colleague{colleagueCount === 1 ? "" : "s"}
            </>
          )}
        </p>
      </header>

      {!organisation.claimedBy && <ClaimCta organisationName={organisation.name} />}

      <section>
        <h2 className="mb-3 font-heading text-lg font-semibold text-foreground">Colleague activity</h2>
        {suppressed ? (
          <p className="rounded-card border border-dashed border-line bg-surface p-4 text-sm text-muted">
            Colleague activity is hidden until this organisation has at least 3 members, to protect
            individual privacy.
          </p>
        ) : colleagues.length === 0 ? (
          <p className="rounded-card border border-dashed border-line bg-surface p-4 text-sm text-muted">
            No colleague activity yet.
          </p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
            {colleagues.slice(0, 20).map((colleague) => (
              <li key={colleague.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <span className="font-medium text-foreground">{colleague.displayName}</span>
                <span className="inline-flex items-center gap-1.5 text-muted">
                  <FlameIcon size={15} className="text-accent-fill" />
                  <span className="tabular-nums">{colleague.currentStreak}</span>
                  <span className="hidden sm:inline">
                    day{colleague.currentStreak === 1 ? "" : "s"} streak
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-heading text-lg font-semibold text-foreground">This week</h2>
        {suppressed ? (
          <p className="rounded-card border border-dashed border-line bg-surface p-4 text-sm text-muted">
            Not enough members yet to show organisation stats.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-card border border-line bg-surface p-4">
              <p className="text-2xl font-semibold tabular-nums text-foreground">{briefsCompletedThisWeek}</p>
              <p className="mt-0.5 text-xs text-muted">Briefs completed this week</p>
            </div>
            <div className="rounded-card border border-line bg-surface p-4">
              <p className="text-2xl font-semibold text-foreground">
                {mostReadVertical ? verticalLabel(mostReadVertical) : "—"}
              </p>
              <p className="mt-0.5 text-xs text-muted">Most-read vertical</p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
