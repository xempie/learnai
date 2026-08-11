import { revalidatePath } from "next/cache";
import { apiFetch, ApiClientError } from "@/lib/api-client";

/**
 * /org/[slug] — LEARN_AI_V1_BUILD_SPEC.md §4.2 cohort page.
 *
 * Server component consuming ONLY `apiFetch` (§2.1 contract) — no direct
 * `@learn-ai/db` or `authProvider` import here. Auth is enforced entirely
 * by `GET /api/v1/org/:slug` (401 signed-out / not verified, 403
 * non-member): this page just reacts to the status `ApiClientError`
 * carries. There is no `/signin` page yet (not built by T03), so a
 * signed-out visitor sees an inline "sign in" message rather than a
 * redirect, per the T06 controller brief.
 */

interface OrgPageResponse {
  organisation: { id: string; name: string; slug: string; memberCount: number };
  colleagueCount: number | null;
  suppressed: boolean;
  colleagues: { displayName: string; currentStreak: number }[];
  aggregates: { briefsCompletedThisWeek: number; mostReadVertical: string | null } | null;
  claimEligible: boolean;
}

async function claimCohort(formData: FormData): Promise<void> {
  "use server";
  const slug = formData.get("slug");
  if (typeof slug !== "string") return;
  try {
    await apiFetch(`/org/${slug}/claim`, { method: "POST" });
  } catch {
    // The claim may already be pending, or the request may have failed —
    // either way, re-rendering the page (below) reflects the current
    // server-side state, which is the only feedback this minimal V1 CTA
    // gives.
  }
  revalidatePath(`/org/${slug}`);
}

export default async function OrgPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  let data: OrgPageResponse;
  try {
    data = await apiFetch<OrgPageResponse>(`/org/${slug}`);
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 401) {
      return (
        <main className="mx-auto max-w-2xl p-8">
          <p className="text-zinc-700 dark:text-zinc-300">
            Please sign in to view this organisation&apos;s cohort page.
          </p>
        </main>
      );
    }
    if (error instanceof ApiClientError) {
      return (
        <main className="mx-auto max-w-2xl p-8">
          <p className="text-red-600">{error.message}</p>
        </main>
      );
    }
    throw error;
  }

  const { organisation, colleagueCount, suppressed, colleagues, aggregates, claimEligible } = data;

  return (
    <main className="mx-auto max-w-2xl space-y-8 p-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">{organisation.name}</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {organisation.memberCount} member{organisation.memberCount === 1 ? "" : "s"}
          {colleagueCount !== null && (
            <>
              {" · "}You and {colleagueCount} colleague{colleagueCount === 1 ? "" : "s"}
            </>
          )}
        </p>
      </header>

      {claimEligible && (
        <form
          action={claimCohort}
          className="rounded border border-zinc-200 p-4 dark:border-zinc-800"
        >
          <input type="hidden" name="slug" value={slug} />
          <p className="mb-2 text-sm text-zinc-600 dark:text-zinc-400">
            No one has claimed this cohort yet. If you manage this organisation&apos;s membership,
            you can claim it.
          </p>
          <button
            type="submit"
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Claim this cohort
          </button>
        </form>
      )}

      <section className="space-y-2">
        <h2 className="text-lg font-medium text-black dark:text-zinc-50">Colleague activity</h2>
        {suppressed ? (
          <p className="text-sm text-zinc-500">
            Colleague activity is hidden until this organisation has at least 3 members, to protect
            individual privacy.
          </p>
        ) : colleagues.length === 0 ? (
          <p className="text-sm text-zinc-500">No colleague activity yet.</p>
        ) : (
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {colleagues.map((colleague, index) => (
              <li key={index} className="flex items-center justify-between py-2 text-sm">
                <span>{colleague.displayName}</span>
                <span className="text-zinc-500">
                  {colleague.currentStreak} day{colleague.currentStreak === 1 ? "" : "s"} streak
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium text-black dark:text-zinc-50">This week</h2>
        {aggregates ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {aggregates.briefsCompletedThisWeek} brief
            {aggregates.briefsCompletedThisWeek === 1 ? "" : "s"} completed this week.
            {aggregates.mostReadVertical && <> Most-read topic: {aggregates.mostReadVertical}.</>}
          </p>
        ) : (
          <p className="text-sm text-zinc-500">
            Not enough members yet to show organisation stats.
          </p>
        )}
      </section>
    </main>
  );
}
