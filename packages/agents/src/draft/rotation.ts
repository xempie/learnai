import type { Vertical } from "../triage/types.js";

/**
 * §5.4: "Vertical rotation over any rolling 5 publishing days: 2 general, 1
 * teaching/learning, 1 marketing, 1 management. Health rotates in at most 1
 * in 10." §12/T10 controller decision: a pure, deterministic function of
 * publishing history — "pick the most-underserved bucket" — no RNG, so the
 * same history always yields the same next pick.
 *
 * `recentEditions` is the vertical picked for each previous publishing day,
 * oldest first (§5.1's `SelectTopN` — one edition per publishing day). This
 * one vertical is treated as the day's rotation target (what `SelectTopN`
 * weights candidate selection toward), not a per-item (news/technique/
 * video) target — the spec's own quota totals to exactly 5 across "5
 * publishing days", i.e. one slot per day.
 *
 * Two independent quotas, checked in this order:
 *
 * 1. Health: "at most 1 in 10" is treated as a fixed once-per-10-day slot
 *    (the 10th day of every 10-day block, i.e. `history.length % 10 === 9`)
 *    rather than an ordinary member of the every-5-day rotation — folding
 *    it into the 5-day greedy quota below would make it win far more than
 *    1-in-10 (its target rate, 0.1/day, is dwarfed by general's 0.4/day,
 *    so a shared deficit-based algorithm would essentially never surface
 *    it on its own). It is skipped if health already appeared in the
 *    trailing 9 days (defensive — the fixed schedule alone already
 *    guarantees this can't happen).
 * 2. Otherwise: the four §5.4 buckets (general / teaching-or-learning /
 *    marketing / management) each have a target count over the trailing 5
 *    days (this day + the last 4). Whichever bucket is furthest behind its
 *    target (`target - countInLast4`) wins; ties break by the bucket order
 *    below (general first). Applied repeatedly from an empty history, this
 *    greedy rule reproduces an exact period-5 cycle — and, because it is a
 *    fixed rotation, ANY 5 consecutive picks from it contain exactly the
 *    target multiset, not just picks aligned to day 0 (verified in
 *    rotation.test.ts). "teaching" vs "learning" within the combined
 *    bucket is decided by whichever of the two appeared less often in the
 *    trailing window (tie -> "teaching").
 */
const ROTATION_WINDOW = 5;
const HEALTH_WINDOW = 10;

type PrimaryBucket = "general" | "teachLearn" | "marketing" | "management";

const PRIMARY_TARGETS: ReadonlyArray<{ bucket: PrimaryBucket; target: number }> = [
  { bucket: "general", target: 2 },
  { bucket: "teachLearn", target: 1 },
  { bucket: "marketing", target: 1 },
  { bucket: "management", target: 1 },
];

function primaryBucketOf(v: Vertical): PrimaryBucket | "health" {
  if (v === "teaching" || v === "learning") return "teachLearn";
  return v as PrimaryBucket | "health";
}

export function pickRotationVertical(recentEditions: readonly Vertical[]): Vertical {
  const dayIndex = recentEditions.length;

  const window10 = recentEditions.slice(-(HEALTH_WINDOW - 1));
  const healthDue = dayIndex % HEALTH_WINDOW === HEALTH_WINDOW - 1;
  if (healthDue && !window10.includes("health")) {
    return "health";
  }

  const window5 = recentEditions.slice(-(ROTATION_WINDOW - 1));
  const counts: Record<PrimaryBucket, number> = {
    general: 0,
    teachLearn: 0,
    marketing: 0,
    management: 0,
  };
  for (const v of window5) {
    const bucket = primaryBucketOf(v);
    if (bucket !== "health") counts[bucket] += 1;
  }

  let winner = PRIMARY_TARGETS[0]!;
  let bestDeficit = -Infinity;
  for (const candidate of PRIMARY_TARGETS) {
    const deficit = candidate.target - counts[candidate.bucket];
    if (deficit > bestDeficit) {
      bestDeficit = deficit;
      winner = candidate;
    }
  }

  if (winner.bucket === "teachLearn") {
    const teachingCount = window5.filter((v) => v === "teaching").length;
    const learningCount = window5.filter((v) => v === "learning").length;
    return teachingCount <= learningCount ? "teaching" : "learning";
  }
  return winner.bucket;
}
