import type { Metadata } from "next";
import { SearchClient } from "@/app/search/search-client";
import { getAllContentItems, getPrompts } from "@/lib/data-source";

export const metadata: Metadata = {
  title: "Search · Learn AI",
};

/**
 * `/search` — debounced search over sample content (title + body), ranked
 * by title match strength, grouped by kind. All content is already
 * in-memory sample data, so search runs client-side over server-fetched
 * arrays rather than hitting a network endpoint per keystroke.
 */
export default async function SearchPage() {
  const [items, prompts] = await Promise.all([getAllContentItems(), getPrompts()]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="mb-6">
        <h1 className="font-heading text-2xl font-semibold text-foreground sm:text-3xl">Search</h1>
        <p className="mt-1 text-sm text-muted">Find a past news item, technique, video, or prompt.</p>
      </header>

      <SearchClient items={items} prompts={prompts} />
    </div>
  );
}
