import { describe, expect, it } from "vitest";
import {
  getAdminMetrics,
  getColleagues,
  getContentSource,
  getContentSources,
  getCurrentUser,
  getEditionByDate,
  getEditions,
  getOrganisation,
  getPrompts,
  getReviewQueue,
  getTodayEdition,
} from "./data-source";

describe("data-source (sample-data backed today)", () => {
  it("getTodayEdition returns the latest edition", async () => {
    const edition = await getTodayEdition();
    expect(edition.editionDate).toBe("2026-08-15");
    expect(edition.items).toHaveLength(3);
  });

  it("getEditions returns all 10 editions, most recent first", async () => {
    const list = await getEditions();
    expect(list).toHaveLength(10);
    expect(list[0]?.editionDate).toBe("2026-08-15");
    expect(list[list.length - 1]?.editionDate).toBe("2026-08-06");
  });

  it("getEditionByDate finds a known date and returns null for an unknown one", async () => {
    expect((await getEditionByDate("2026-08-10"))?.editionDate).toBe("2026-08-10");
    expect(await getEditionByDate("2099-01-01")).toBeNull();
  });

  it("getPrompts returns all 14 prompts", async () => {
    expect(await getPrompts()).toHaveLength(14);
  });

  it("getContentSources / getContentSource resolve by id", async () => {
    const sources = await getContentSources();
    expect(sources.length).toBeGreaterThan(0);
    const firstId = sources[0]?.id;
    expect(firstId).toBeTruthy();
    const first = await getContentSource(firstId!);
    expect(first?.id).toBe(firstId);
    expect(await getContentSource("does-not-exist")).toBeNull();
  });

  it("getOrganisation returns Macquarie University", async () => {
    expect((await getOrganisation()).slug).toBe("macquarie-university");
  });

  it("getColleagues excludes members who opted out of cohort display", async () => {
    const list = await getColleagues();
    expect(list.every((c) => c.showInCohort)).toBe(true);
    expect(list.length).toBe(7);
  });

  it("getCurrentUser returns the sample member", async () => {
    const user = await getCurrentUser();
    expect(user.currentStreak).toBe(12);
    expect(user.tier).toBe("free");
  });

  it("getReviewQueue returns the 4 in_review items", async () => {
    expect(await getReviewQueue()).toHaveLength(4);
  });

  it("getAdminMetrics returns all four series", async () => {
    const metrics = await getAdminMetrics();
    expect(Object.keys(metrics)).toEqual([
      "signupsPerDay",
      "opensPerDay",
      "completionsPerDay",
      "reviewTimeMinutesPerDay",
    ]);
  });
});
