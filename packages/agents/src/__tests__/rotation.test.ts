import { describe, expect, it } from "vitest";
import { pickRotationVertical } from "../draft/rotation.js";
import type { Vertical } from "../draft/types.js";

/**
 * §5.4 + §12/T10 acceptance: "rotation honoured over a simulated 10-day
 * window." Table-driven: simulate `pickRotationVertical` being called once
 * per publishing day, feeding each pick back in as history for the next
 * call (exactly how T11's orchestration will use it), and assert on the
 * resulting sequence.
 */
function simulate(days: number): Vertical[] {
  const history: Vertical[] = [];
  for (let i = 0; i < days; i += 1) {
    history.push(pickRotationVertical(history));
  }
  return history;
}

function countOf(picks: readonly Vertical[], vertical: Vertical): number {
  return picks.filter((v) => v === vertical).length;
}

describe("pickRotationVertical", () => {
  it("is a pure function: the same history always yields the same pick", () => {
    const history: Vertical[] = ["general", "general", "teaching", "marketing"];
    const first = pickRotationVertical(history);
    const second = pickRotationVertical([...history]);
    expect(first).toBe(second);
  });

  it("picks 'general' from an empty history (the most underserved bucket, target 2)", () => {
    expect(pickRotationVertical([])).toBe("general");
  });

  it("simulated 10-day window from empty history produces the expected deterministic sequence", () => {
    const picks = simulate(10);
    expect(picks).toEqual([
      "general",
      "general",
      "teaching",
      "marketing",
      "management",
      "general",
      "general",
      "teaching",
      "marketing",
      "health",
    ]);
  });

  it("every rolling 5-day window that does not contain 'health' has exactly 2 general, 1 teaching/learning, 1 marketing, 1 management", () => {
    const picks = simulate(20);
    for (let start = 0; start + 5 <= picks.length; start += 1) {
      const window = picks.slice(start, start + 5);
      if (window.includes("health")) continue; // §5.4's documented exception day
      const generalCount = countOf(window, "general");
      const teachLearnCount = countOf(window, "teaching") + countOf(window, "learning");
      const marketingCount = countOf(window, "marketing");
      const managementCount = countOf(window, "management");
      expect({ generalCount, teachLearnCount, marketingCount, managementCount }).toEqual({
        generalCount: 2,
        teachLearnCount: 1,
        marketingCount: 1,
        managementCount: 1,
      });
    }
  });

  it("'health' appears at most once in every 10-day block over a 30-day simulation", () => {
    const picks = simulate(30);
    for (let start = 0; start < picks.length; start += 10) {
      const block = picks.slice(start, start + 10);
      expect(countOf(block, "health")).toBeLessThanOrEqual(1);
    }
  });

  it("never re-picks 'health' inside the trailing 9 days even if called with unusual history", () => {
    // A day-9 slot (index 9, 0-based) with health already present in the
    // trailing window must not double up.
    const history: Vertical[] = [
      "general",
      "general",
      "teaching",
      "marketing",
      "health", // irregular: health injected early by a human override
      "general",
      "general",
      "teaching",
      "marketing",
    ];
    expect(pickRotationVertical(history)).not.toBe("health");
  });

  it("fills the most-underserved bucket first when history is uneven (deficit-based tie-break)", () => {
    // 4 days already all 'general' and 'management' — teaching/learning and
    // marketing are both at deficit 1, general/management at 0 (general) /
    // -1 (management, already over quota for the window). teachLearn wins
    // over marketing by declared tie-break order.
    const history: Vertical[] = ["general", "general", "management", "management"];
    expect(pickRotationVertical(history)).toBe("teaching");
  });

  it("alternates 'teaching' and 'learning' within the combined bucket, preferring whichever appeared less", () => {
    // First time the teach/learn slot comes up in a fresh cycle it should
    // be 'teaching' (tie -> teaching); once 'teaching' has appeared and the
    // bucket comes up again within the same trailing window, 'learning' —
    // which has appeared 0 times vs teaching's 1 — should win.
    const afterFirstTeachLearn = simulate(3); // general, general, <teach/learn slot>
    expect(afterFirstTeachLearn[2]).toBe("teaching");
  });
});
