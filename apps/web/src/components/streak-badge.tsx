import { FlameIcon } from "@/components/icons";

/**
 * Streak flame + count. `pulse` triggers the single-shot scale animation
 * (see `.animate-streak-pulse` in globals.css, which itself is neutralised
 * under `prefers-reduced-motion: reduce`).
 */
export function StreakBadge({ streak, pulse = false }: { streak: number; pulse?: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-control border border-line bg-surface px-2 py-1 text-sm font-medium text-foreground"
      aria-label={`${streak} day streak`}
    >
      <FlameIcon
        size={16}
        className={`text-accent-fill ${pulse ? "animate-streak-pulse" : ""}`}
      />
      <span className="tabular-nums">{streak}</span>
    </span>
  );
}
