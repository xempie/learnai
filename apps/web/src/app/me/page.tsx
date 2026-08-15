import { UserIcon } from "@/components/icons";
import { getCurrentUser } from "@/lib/data-source";

/**
 * `/me` — placeholder nav target for Phase 1's app shell. Shows the
 * sample current user's basics; the full account/preferences page is a
 * later-phase build.
 */
export default async function MePage() {
  const user = await getCurrentUser();

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <div className="rounded-card border border-dashed border-line bg-surface p-8 text-center">
        <UserIcon size={28} className="mx-auto mb-3 text-muted" />
        <h1 className="font-heading text-xl font-semibold text-foreground">{user.displayName}</h1>
        <p className="mt-1 text-sm text-muted">
          {user.jobRole} · {user.currentStreak} day streak · Full account settings coming soon
        </p>
      </div>
    </div>
  );
}
