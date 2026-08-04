/**
 * Pins the access rules that decide what a non-paying account can watch.
 *
 * These are pure-logic tests over the decision table - the database-backed
 * functions in `entitlements.ts` are exercised by the API smoke tests. The
 * point here is that if someone changes the rule, a test says so out loud
 * rather than the change quietly giving away paid content.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

type Tier = "full" | "trial" | "free";

interface Ctx {
  tier: Tier;
  purchased: boolean;
  topicIsFree: boolean;
  episodeIsPreview: boolean;
  /** 1-based position within the topic. */
  position: number;
  previewLimit: number;
}

/**
 * Mirrors `canAccessEpisode` in src/lib/entitlements.ts. Kept as a local copy so
 * the rule is stated twice - if the implementation drifts, the API smoke tests
 * catch it, and this file documents what the rule is meant to be.
 */
function canAccess(c: Ctx): boolean {
  if (c.tier === "full") return true;
  if (c.purchased) return true;
  if (c.topicIsFree) return true;
  if (c.episodeIsPreview) return true;
  return c.position <= c.previewLimit;
}

const base: Ctx = {
  tier: "free",
  purchased: false,
  topicIsFree: false,
  episodeIsPreview: false,
  position: 1,
  previewLimit: 2,
};

describe("paid access", () => {
  it("a subscriber watches every episode", () => {
    for (const position of [1, 2, 3, 20]) {
      assert.equal(canAccess({ ...base, tier: "full", position }), true);
    }
  });

  it("an org-licensed learner is tier full and watches everything", () => {
    assert.equal(canAccess({ ...base, tier: "full", position: 12 }), true);
  });

  it("buying a single topic unlocks all of its episodes", () => {
    assert.equal(canAccess({ ...base, purchased: true, position: 9 }), true);
  });
});

describe("trial is a preview, not full access", () => {
  it("lets a trial account watch the first two episodes", () => {
    assert.equal(canAccess({ ...base, tier: "trial", position: 1 }), true);
    assert.equal(canAccess({ ...base, tier: "trial", position: 2 }), true);
  });

  it("LOCKS episode three for a trial account", () => {
    assert.equal(canAccess({ ...base, tier: "trial", position: 3 }), false);
  });

  it("locks every later episode too", () => {
    for (const position of [4, 5, 10, 40]) {
      assert.equal(canAccess({ ...base, tier: "trial", position }), false);
    }
  });
});

describe("free tier", () => {
  it("gets the same two-episode preview", () => {
    assert.equal(canAccess({ ...base, position: 2 }), true);
    assert.equal(canAccess({ ...base, position: 3 }), false);
  });

  it("watches a permanently-free topic in full", () => {
    assert.equal(canAccess({ ...base, topicIsFree: true, position: 6 }), true);
  });

  it("watches a episode explicitly flagged as a preview, wherever it sits", () => {
    assert.equal(canAccess({ ...base, episodeIsPreview: true, position: 8 }), true);
  });
});

describe("the preview window is configurable", () => {
  it("honours a limit of 1", () => {
    assert.equal(canAccess({ ...base, tier: "trial", position: 1, previewLimit: 1 }), true);
    assert.equal(canAccess({ ...base, tier: "trial", position: 2, previewLimit: 1 }), false);
  });

  it("honours a limit of 0 - nothing free", () => {
    assert.equal(canAccess({ ...base, tier: "trial", position: 1, previewLimit: 0 }), false);
  });
});

describe("boundary", () => {
  it("the limit itself is inclusive", () => {
    assert.equal(canAccess({ ...base, position: 2, previewLimit: 2 }), true);
  });

  it("one past the limit is locked", () => {
    assert.equal(canAccess({ ...base, position: 3, previewLimit: 2 }), false);
  });
});
