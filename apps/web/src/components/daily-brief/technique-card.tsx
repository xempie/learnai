import { Wand2Icon } from "@/components/icons";
import { CopyButton } from "@/components/daily-brief/copy-button";
import { Prose, splitFencedBlock } from "@/lib/markdown-lite";
import type { ContentItem } from "@/lib/sample-data";

export function TechniqueCard({ item }: { item: ContentItem }) {
  const { before, code, after } = splitFencedBlock(item.bodyMd);

  return (
    <article className="rounded-card border border-line bg-surface p-6">
      <div className="mb-3 flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-control bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent">
          <Wand2Icon size={14} />
          Technique
        </span>
        <span className="text-xs text-muted">Under 10 minutes</span>
      </div>

      <h2 className="mb-3 font-heading text-xl font-semibold text-foreground sm:text-2xl">{item.title}</h2>

      <Prose text={before} className="max-w-prose space-y-3 text-[0.975rem] leading-relaxed text-foreground" />

      {code && (
        <div className="mt-4 overflow-hidden rounded-control border border-line bg-background">
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <span className="text-xs font-medium text-muted">Prompt</span>
            <CopyButton text={code} />
          </div>
          <pre className="overflow-x-auto px-3 py-3 text-sm leading-relaxed text-foreground">
            <code>{code}</code>
          </pre>
        </div>
      )}

      {after && (
        <Prose text={after} className="mt-4 max-w-prose space-y-3 text-[0.975rem] leading-relaxed text-foreground" />
      )}
    </article>
  );
}
