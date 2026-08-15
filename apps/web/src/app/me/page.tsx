import type { Metadata } from "next";
import { PreferencesForm } from "@/app/me/preferences-form";
import { FlameIcon, UserIcon } from "@/components/icons";
import { getCurrentUser } from "@/lib/data-source";

export const metadata: Metadata = {
  title: "Me · Learn AI",
};

/**
 * `/me` — profile + preferences (LEARN_AI_V1_BUILD_SPEC.md §8
 * `GET /me` / `PATCH /me/preferences`). Sample-data only: see
 * `preferences-form.tsx` for how "optimistic save" works without a
 * backend to PATCH.
 */
export default async function MePage() {
  const user = await getCurrentUser();

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="mb-6 flex items-center gap-4 rounded-card border border-line bg-surface p-5">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <UserIcon size={26} />
        </span>
        <div className="min-w-0">
          <h1 className="font-heading text-lg font-semibold text-foreground">{user.displayName}</h1>
          <p className="truncate text-sm text-muted">
            {user.jobRole} &middot; {user.email}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-control border border-line px-2 py-0.5 text-xs font-medium text-foreground">
              <FlameIcon size={13} className="text-accent-fill" />
              <span className="tabular-nums">{user.currentStreak}</span> day streak
            </span>
            <span className="text-xs text-muted">Longest: {user.longestStreak} days</span>
            <span
              className={`rounded-control px-2 py-0.5 text-xs font-medium capitalize ${
                user.tier === "premium" ? "bg-accent/10 text-accent" : "bg-line text-muted"
              }`}
            >
              {user.tier}
            </span>
          </div>
        </div>
      </header>

      <h2 className="mb-4 font-heading text-lg font-semibold text-foreground">Preferences</h2>
      <PreferencesForm initial={user.preferences} />
    </div>
  );
}
