import type { Metadata } from "next";
import { SourcesTable } from "@/app/admin/sources/sources-table";
import { ExternalLinkIcon, LightbulbIcon } from "@/components/icons";
import { getContentSources } from "@/lib/data-source";
import { verticalLabel } from "@/lib/verticals";

export const metadata: Metadata = {
  title: "Sources · Learn AI Admin",
};

/**
 * `/admin/sources` — content source health (§5.1 `PollSources`) plus the
 * §5.4 tier-3 "idea prompts only" panel: tier-3 sources never feed a draft
 * (`SelectTopN` excludes `source_tier = 3`), so they surface here as
 * read-only idea cards for a human to chase through a tier-1/2 source.
 */
export default async function AdminSourcesPage() {
  const sources = await getContentSources();
  const ideaSources = sources.filter((source) => source.tier === 3);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <header>
        <h2 className="font-heading text-lg font-semibold text-foreground">Content sources</h2>
        <p className="mt-0.5 text-xs text-muted">
          Polled by the daily pipeline (§5.1). Tier 1/2 feed drafts directly; tier 3 never does.
        </p>
      </header>

      <SourcesTable sources={sources} />

      <section>
        <h3 className="mb-1 flex items-center gap-1.5 font-heading text-base font-semibold text-foreground">
          <LightbulbIcon size={16} className="text-accent" />
          Tier 3 idea prompts
        </h3>
        <p className="mb-3 max-w-2xl text-xs text-muted">
          Tier-3 sources are never drafted from directly (§5.4) — they surface here as idea prompts only, for a
          human to pursue through a tier-1/2 source before anything gets drafted.
        </p>
        {ideaSources.length === 0 ? (
          <p className="rounded-card border border-dashed border-line bg-surface p-6 text-center text-sm text-muted">
            No tier-3 sources configured.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {ideaSources.map((source) => (
              <li key={source.id} className="rounded-card border border-dashed border-line bg-surface p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-foreground">{source.name}</p>
                  <span className="shrink-0 rounded-control bg-line px-1.5 py-0.5 text-[10px] font-medium text-muted">
                    Idea only
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  {verticalLabel(source.vertical)} &middot; {source.active ? "Being watched" : "Inactive"}
                </p>
                <p className="mt-2 text-sm text-foreground">
                  Possible {verticalLabel(source.vertical).toLowerCase()} angle worth chasing through a tier-1/2
                  source before drafting.
                </p>
                <a
                  href={source.homepageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-primary transition-colors duration-200 hover:underline"
                >
                  View source
                  <ExternalLinkIcon size={11} />
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
