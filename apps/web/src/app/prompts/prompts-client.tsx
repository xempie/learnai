"use client";

import { useMemo, useState } from "react";
import { CopyButton } from "@/components/daily-brief/copy-button";
import { LockIcon, MessageSquareIcon, SparklesIcon } from "@/components/icons";
import { UpgradeSheet } from "@/components/upgrade-sheet";
import { VerticalFilterChips, useVerticalFilter } from "@/components/vertical-filter-chips";
import type { Prompt } from "@/lib/sample-data";
import { verticalLabel } from "@/lib/verticals";

export function PromptsClient({ prompts, isFree }: { prompts: Prompt[]; isFree: boolean }) {
  const [vertical, setVertical] = useVerticalFilter();
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  const filtered = useMemo(
    () => (vertical === "all" ? prompts : prompts.filter((prompt) => prompt.vertical === vertical)),
    [prompts, vertical],
  );

  const freeCount = prompts.filter((prompt) => !prompt.isPremium).length;

  return (
    <div className="space-y-6">
      <VerticalFilterChips value={vertical} onChange={setVertical} />

      {isFree && (
        <p className="text-xs text-muted">
          {freeCount} free prompts &middot; the rest are part of Learn AI Premium.
        </p>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-card border border-dashed border-line bg-surface p-8 text-center">
          <MessageSquareIcon size={28} className="mx-auto mb-3 text-muted" />
          <p className="font-heading text-lg font-medium text-foreground">No prompts in this vertical</p>
          <p className="mt-1 text-sm text-muted">Try a different filter, or select &ldquo;All&rdquo;.</p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {filtered.map((prompt) => {
            const locked = isFree && prompt.isPremium;
            return (
              <li key={prompt.id} id={prompt.id} className="scroll-mt-6">
                <article className="h-full rounded-card border border-line bg-surface p-5">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-muted">{verticalLabel(prompt.vertical)}</span>
                    {prompt.isPremium && (
                      <span className="inline-flex items-center gap-1 rounded-control bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">
                        <SparklesIcon size={11} />
                        Premium
                      </span>
                    )}
                  </div>

                  <h2 className="mb-2 font-heading text-base font-semibold text-foreground">{prompt.title}</h2>

                  {locked ? (
                    <>
                      <p className="mb-3 line-clamp-2 text-sm text-muted select-none">{prompt.body}</p>
                      <button
                        type="button"
                        onClick={() => setUpgradeOpen(true)}
                        className="inline-flex cursor-pointer items-center gap-1.5 rounded-control border border-line bg-background px-2.5 py-1.5 text-xs font-medium text-muted transition-colors duration-200 hover:border-primary hover:text-primary"
                      >
                        <LockIcon size={13} />
                        Unlock with Premium
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="mb-3 text-sm leading-relaxed text-foreground">{prompt.body}</p>
                      <CopyButton text={prompt.body} />
                    </>
                  )}

                  {prompt.jobRole && <p className="mt-3 text-xs text-muted">For: {prompt.jobRole}</p>}
                </article>
              </li>
            );
          })}
        </ul>
      )}

      <UpgradeSheet
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        reason="This prompt is part of Learn AI Premium."
      />
    </div>
  );
}
