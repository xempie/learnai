import { NewspaperIcon } from "@/components/icons";
import { Prose } from "@/lib/markdown-lite";
import type { ContentItem, ContentSource } from "@/lib/sample-data";

export function NewsCard({ item, source }: { item: ContentItem; source: ContentSource | null }) {
  return (
    <article className="rounded-card border border-line bg-surface p-6">
      <div className="mb-3 flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-control bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
          <NewspaperIcon size={14} />
          News
        </span>
        {source && (
          <span className="text-xs text-muted">
            Source: <span className="font-medium text-foreground">{source.name}</span>
          </span>
        )}
      </div>

      <h2 className="mb-3 font-heading text-xl font-semibold text-foreground sm:text-2xl">{item.title}</h2>

      <Prose text={item.bodyMd} className="max-w-prose space-y-3 text-[0.975rem] leading-relaxed text-foreground" />

      {item.sourceUrl && (
        <a
          href={item.sourceUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-4 inline-block cursor-pointer text-sm font-medium text-primary underline decoration-1 underline-offset-2 transition-colors duration-200 hover:text-primary-hover"
        >
          Read the source
        </a>
      )}
    </article>
  );
}
