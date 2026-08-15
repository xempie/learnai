"use client";

import type { Vertical } from "@/lib/sample-data";
import { usePersistedState } from "@/lib/use-persisted-state";
import { VERTICALS, verticalLabel } from "@/lib/verticals";

export type VerticalFilterValue = Vertical | "all";

/**
 * Shared storage key: `/archive` and `/prompts` both use the same "reader
 * vertical filter" preference, per LEARN_AI_V1_BUILD_SPEC.md §12 T16 ("the
 * vertical filter persists to preferences") — this is the UI-Phase-2
 * stand-in for that preference until there's a backend to PATCH.
 */
const STORAGE_KEY = "learnai:vertical-filter";

export function useVerticalFilter(): [VerticalFilterValue, (value: VerticalFilterValue) => void] {
  return usePersistedState<VerticalFilterValue>(STORAGE_KEY, "all");
}

export function VerticalFilterChips({
  value,
  onChange,
}: {
  value: VerticalFilterValue;
  onChange: (value: VerticalFilterValue) => void;
}) {
  const options: VerticalFilterValue[] = ["all", ...VERTICALS];

  return (
    <div role="group" aria-label="Filter by vertical" className="flex flex-wrap gap-2">
      {options.map((option) => {
        const active = option === value;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option)}
            className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm font-medium transition-colors duration-200 ${
              active
                ? "border-primary bg-primary text-on-primary"
                : "border-line bg-surface text-muted hover:border-primary hover:text-primary"
            }`}
          >
            {option === "all" ? "All" : verticalLabel(option)}
          </button>
        );
      })}
    </div>
  );
}
