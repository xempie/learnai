"use client";

import { useState } from "react";
import { CircleCheckBigIcon } from "@/components/icons";
import { useBumpStreak } from "@/components/streak-context";
import { COMPLETED_EDITIONS_KEY } from "@/lib/completed-editions";
import { usePersistedState } from "@/lib/use-persisted-state";

/**
 * Optimistic completion affordance: no backend write in this UI-first
 * phase, so "optimistic" here just means the UI commits immediately
 * (streak bump + button state) without waiting on anything, which is the
 * same interaction pattern a real mutation would use. When `editionDate`
 * is supplied (the daily brief passes today's), completion is also
 * persisted into the same sample-state list `/archive` reads for its
 * completion ticks.
 */
export function MarkDoneButton({ editionDate }: { editionDate?: string }) {
  const [done, setDone] = useState(false);
  const bumpStreak = useBumpStreak();
  const [completed, setCompleted] = usePersistedState<string[]>(COMPLETED_EDITIONS_KEY, []);

  function handleClick() {
    if (done) return;
    setDone(true);
    bumpStreak();
    if (editionDate && !completed.includes(editionDate)) {
      setCompleted([...completed, editionDate]);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={done}
      aria-pressed={done}
      className={`inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-control px-5 py-3 text-sm font-semibold transition-colors duration-200 disabled:cursor-default sm:w-auto ${
        done
          ? "bg-success/10 text-success"
          : "bg-primary text-on-primary hover:bg-primary-hover"
      }`}
    >
      <CircleCheckBigIcon size={18} className={done ? "animate-streak-pulse" : ""} />
      {done ? "Done — see you tomorrow" : "Mark today done"}
    </button>
  );
}
