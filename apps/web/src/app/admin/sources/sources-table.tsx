"use client";

import { useState } from "react";
import { TriangleAlertIcon } from "@/components/icons";
import { formatDate } from "@/lib/format";
import type { ContentSource } from "@/lib/sample-data";
import { verticalLabel } from "@/lib/verticals";

function tierBadgeClasses(tier: 1 | 2 | 3): string {
  if (tier === 1) return "bg-success/10 text-success";
  if (tier === 2) return "bg-accent/15 text-accent";
  return "bg-line text-muted";
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ${
        checked ? "bg-success" : "bg-line"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${
          checked ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

/** Sources actually eligible to feed a draft — tier 1/2 (§5.4). Tier 3 gets its own idea-prompt panel on the page. */
export function SourcesTable({ sources }: { sources: ContentSource[] }) {
  const [activeState, setActiveState] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(sources.map((source) => [source.id, source.active])),
  );

  const draftable = sources.filter((source) => source.tier !== 3);

  return (
    <div className="overflow-x-auto rounded-card border border-line bg-surface">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs font-medium text-muted">
            <th className="px-3 py-2">Name</th>
            <th className="px-3 py-2">Tier</th>
            <th className="px-3 py-2">Vertical</th>
            <th className="px-3 py-2">Last item</th>
            <th className="px-3 py-2">Failures</th>
            <th className="px-3 py-2 text-right">Active</th>
          </tr>
        </thead>
        <tbody>
          {draftable.map((source) => {
            const active = activeState[source.id] ?? source.active;
            return (
              <tr key={source.id} className="border-b border-line last:border-b-0 hover:bg-line/20">
                <td className="px-3 py-2">
                  <a
                    href={source.homepageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="cursor-pointer font-medium text-foreground transition-colors duration-200 hover:text-primary hover:underline"
                  >
                    {source.name}
                  </a>
                </td>
                <td className="px-3 py-2">
                  <span className={`rounded-control px-2 py-0.5 text-[11px] font-medium ${tierBadgeClasses(source.tier)}`}>
                    Tier {source.tier}
                  </span>
                </td>
                <td className="px-3 py-2 text-muted">{verticalLabel(source.vertical)}</td>
                <td className="px-3 py-2 text-muted">{source.lastItemAt ? formatDate(source.lastItemAt) : "Never"}</td>
                <td className="px-3 py-2">
                  {source.consecutiveFailures > 0 ? (
                    <span
                      className={`inline-flex items-center gap-1 ${
                        source.consecutiveFailures >= 3 ? "text-danger" : "text-muted"
                      }`}
                    >
                      <TriangleAlertIcon size={12} />
                      {source.consecutiveFailures}
                    </span>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  <Toggle
                    checked={active}
                    onChange={(value) => setActiveState((prev) => ({ ...prev, [source.id]: value }))}
                    label={`${source.name} active`}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
