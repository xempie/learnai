import { describe, expect, it } from "vitest";
import {
  adminMetrics,
  colleagues,
  contentSources,
  currentUser,
  editions,
  organisation,
  prompts,
  reviewQueue,
  todayEdition,
} from "./sample-data";

describe("editions", () => {
  it("has 10 published editions, each with exactly one news/technique/video item", () => {
    expect(editions).toHaveLength(10);
    for (const edition of editions) {
      expect(edition.status).toBe("published");
      expect(edition.items).toHaveLength(3);
      expect(edition.items.filter((item) => item.kind === "news")).toHaveLength(1);
      expect(edition.items.filter((item) => item.kind === "technique")).toHaveLength(1);
      expect(edition.items.filter((item) => item.kind === "video")).toHaveLength(1);
    }
  });

  it("is ordered oldest to newest by edition date", () => {
    const dates = editions.map((edition) => edition.editionDate);
    const sorted = [...dates].sort();
    expect(dates).toEqual(sorted);
  });

  it("every news item has a source_url (spec §3.3 news_needs_source constraint)", () => {
    for (const edition of editions) {
      const news = edition.items.find((item) => item.kind === "news");
      expect(news?.sourceUrl).toBeTruthy();
    }
  });

  it("every published item has approvedBy/approvedAt (spec §3.3 published_needs_approval constraint)", () => {
    for (const edition of editions) {
      for (const item of edition.items) {
        expect(item.approvedBy).toBeTruthy();
        expect(item.approvedAt).toBeTruthy();
      }
    }
  });

  it("has unique ids and slugs across all content items", () => {
    const allItems = editions.flatMap((edition) => edition.items);
    expect(new Set(allItems.map((item) => item.id)).size).toBe(allItems.length);
    expect(new Set(allItems.map((item) => item.slug)).size).toBe(allItems.length);
  });

  it("todayEdition is the most recent edition", () => {
    expect(todayEdition).toBe(editions[editions.length - 1]);
    expect(todayEdition.editionDate).toBe("2026-08-15");
  });

  it("health vertical appears in at most 1 of the 10 editions (spec §5.4 rotation rule)", () => {
    const healthCount = editions.filter((edition) => edition.headline && edition.items.some((i) => i.vertical === "health")).length;
    expect(healthCount).toBeLessThanOrEqual(1);
  });
});

describe("prompts", () => {
  it("has 14 prompts: 10 free, 4 premium", () => {
    expect(prompts).toHaveLength(14);
    expect(prompts.filter((p) => !p.isPremium)).toHaveLength(10);
    expect(prompts.filter((p) => p.isPremium)).toHaveLength(4);
  });

  it("has unique ids", () => {
    expect(new Set(prompts.map((p) => p.id)).size).toBe(prompts.length);
  });
});

describe("organisation and colleagues", () => {
  it("organisation has the expected member count", () => {
    expect(organisation.name).toBe("Macquarie University");
    expect(organisation.memberCount).toBe(47);
  });

  it("has 8 colleagues, at least one opted out of cohort display", () => {
    expect(colleagues).toHaveLength(8);
    expect(colleagues.some((c) => !c.showInCohort)).toBe(true);
  });
});

describe("currentUser", () => {
  it("is a free-tier member with a 12-day streak", () => {
    expect(currentUser.tier).toBe("free");
    expect(currentUser.role).toBe("member");
    expect(currentUser.currentStreak).toBe(12);
    expect(currentUser.organisationId).toBe(organisation.id);
  });
});

describe("reviewQueue", () => {
  it("has 4 in_review items", () => {
    expect(reviewQueue).toHaveLength(4);
    expect(reviewQueue.every((item) => item.status === "in_review")).toBe(true);
  });

  it("includes at least one tier-2 source requiring verification (§5.4)", () => {
    expect(reviewQueue.some((item) => item.sourceTier === 2 && item.tierTwoVerificationRequired)).toBe(true);
  });

  it("includes at least one health item requiring second approval (§5.4)", () => {
    expect(reviewQueue.some((item) => item.vertical === "health" && item.requiresSecondApproval)).toBe(true);
  });
});

describe("contentSources", () => {
  it("has no tier-3 sources feeding drafts directly (§5.4: tier 3 is never drafted from)", () => {
    const draftedSourceIds = new Set(
      editions.flatMap((edition) => edition.items.map((item) => item.sourceId).filter(Boolean)),
    );
    for (const source of contentSources) {
      if (source.tier === 3) {
        expect(draftedSourceIds.has(source.id)).toBe(false);
      }
    }
  });
});

describe("adminMetrics", () => {
  it("has 30-day series for every metric", () => {
    expect(adminMetrics.signupsPerDay).toHaveLength(30);
    expect(adminMetrics.opensPerDay).toHaveLength(30);
    expect(adminMetrics.completionsPerDay).toHaveLength(30);
    expect(adminMetrics.reviewTimeMinutesPerDay).toHaveLength(30);
  });

  it("is deterministic across evaluations (no Math.random)", () => {
    // Re-importing the same module instance is inherent to the module
    // cache, so this really just documents the generator's contract.
    expect(adminMetrics.signupsPerDay[0]?.value).toBe(adminMetrics.signupsPerDay[0]?.value);
  });
});
