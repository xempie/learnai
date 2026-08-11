import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPool } from "@learn-ai/db";
import {
  insertTestOrganisation,
  insertTestStreak,
  insertTestUser,
  sessionRequestFor,
} from "@/lib/test-helpers";
import { GET } from "./route";

// DB-backed tests. Skipped — not failed — when DATABASE_URL is unset, same
// pattern as apps/web/src/lib/auth/provider.integration.test.ts.
const databaseUrl = process.env.DATABASE_URL;

interface OrgPageBody {
  organisation: { id: string; name: string; slug: string; memberCount: number };
  colleagueCount: number | null;
  suppressed: boolean;
  colleagues: { displayName: string; currentStreak: number }[];
  aggregates: { briefsCompletedThisWeek: number; mostReadVertical: string | null } | null;
  claimEligible: boolean;
  error?: { code: string };
}

describe.skipIf(!databaseUrl)("GET /api/v1/org/[slug] (§4.2 / T06 acceptance)", () => {
  beforeAll(() => {
    process.env.AUTH_SECRET ??= "integration-test-secret";
  });

  afterAll(async () => {
    await getPool().end();
  });

  it("a member sees colleagues (display name + streak), no emails, opt-out respected", async () => {
    const org = await insertTestOrganisation(getPool());
    const viewer = await insertTestUser(getPool(), {
      organisationId: org.id,
      displayName: "Viewer Person",
    });
    const colleague = await insertTestUser(getPool(), {
      organisationId: org.id,
      displayName: "Colleague One",
    });
    await insertTestStreak(getPool(), colleague, 5);
    await insertTestUser(getPool(), {
      organisationId: org.id,
      displayName: "Hidden Person",
      showInCohort: false,
    });

    const req = await sessionRequestFor(viewer, `http://localhost:3000/api/v1/org/${org.slug}`);
    const res = await GET(req, { params: Promise.resolve({ slug: org.slug }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as OrgPageBody;

    expect(body.suppressed).toBe(false);
    expect(body.organisation).toMatchObject({ id: org.id, slug: org.slug, memberCount: 3 });
    expect(body.colleagueCount).toBe(2);
    expect(body.colleagues).toHaveLength(1);
    expect(body.colleagues[0]).toMatchObject({ displayName: "Colleague One", currentStreak: 5 });
    expect(body.colleagues.some((c) => c.displayName === "Hidden Person")).toBe(false);
    expect(body.aggregates).toMatchObject({ briefsCompletedThisWeek: 0, mostReadVertical: null });

    expect(JSON.stringify(body)).not.toContain("@");
  });

  it("a non-member of the organisation gets 403", async () => {
    const orgA = await insertTestOrganisation(getPool());
    const orgB = await insertTestOrganisation(getPool());
    await insertTestUser(getPool(), { organisationId: orgA.id });
    await insertTestUser(getPool(), { organisationId: orgA.id });
    const outsider = await insertTestUser(getPool(), { organisationId: orgB.id });

    const req = await sessionRequestFor(outsider, `http://localhost:3000/api/v1/org/${orgA.slug}`);
    const res = await GET(req, { params: Promise.resolve({ slug: orgA.slug }) });
    expect(res.status).toBe(403);
    const body = (await res.json()) as OrgPageBody;
    expect(body.error?.code).toBe("FORBIDDEN");
  });

  it("no email address ever appears anywhere in the response payload", async () => {
    const org = await insertTestOrganisation(getPool());
    const viewer = await insertTestUser(getPool(), { organisationId: org.id });
    await insertTestUser(getPool(), { organisationId: org.id });
    await insertTestUser(getPool(), { organisationId: org.id });

    const req = await sessionRequestFor(viewer, `http://localhost:3000/api/v1/org/${org.slug}`);
    const res = await GET(req, { params: Promise.resolve({ slug: org.slug }) });
    const body = (await res.json()) as OrgPageBody;

    expect(JSON.stringify(body)).not.toContain("@");
  });

  it("suppresses colleague counts and aggregates when member_count < 3", async () => {
    const org = await insertTestOrganisation(getPool());
    const viewer = await insertTestUser(getPool(), { organisationId: org.id });
    await insertTestUser(getPool(), { organisationId: org.id }); // member_count = 2

    const req = await sessionRequestFor(viewer, `http://localhost:3000/api/v1/org/${org.slug}`);
    const res = await GET(req, { params: Promise.resolve({ slug: org.slug }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as OrgPageBody;

    expect(body.suppressed).toBe(true);
    expect(body.colleagueCount).toBeNull();
    expect(body.aggregates).toBeNull();
    expect(body.colleagues).toEqual([]);
    expect(body.organisation.memberCount).toBe(2);
  });

  it("members with show_in_cohort = false never appear, even at member_count >= 3", async () => {
    const org = await insertTestOrganisation(getPool());
    const viewer = await insertTestUser(getPool(), { organisationId: org.id });
    await insertTestUser(getPool(), { organisationId: org.id, displayName: "Visible" });
    await insertTestUser(getPool(), {
      organisationId: org.id,
      displayName: "Opted Out",
      showInCohort: false,
    });

    const req = await sessionRequestFor(viewer, `http://localhost:3000/api/v1/org/${org.slug}`);
    const res = await GET(req, { params: Promise.resolve({ slug: org.slug }) });
    const body = (await res.json()) as OrgPageBody;

    expect(body.colleagues.map((c) => c.displayName)).toEqual(["Visible"]);
  });

  it("claimEligible is true for an unclaimed org and false once claimed", async () => {
    const org = await insertTestOrganisation(getPool());
    const viewer = await insertTestUser(getPool(), { organisationId: org.id });
    await insertTestUser(getPool(), { organisationId: org.id });
    await insertTestUser(getPool(), { organisationId: org.id });

    const req1 = await sessionRequestFor(viewer, `http://localhost:3000/api/v1/org/${org.slug}`);
    const res1 = await GET(req1, { params: Promise.resolve({ slug: org.slug }) });
    expect(((await res1.json()) as OrgPageBody).claimEligible).toBe(true);

    await getPool().query(
      `UPDATE organisations SET claimed_by = $1, claimed_at = now() WHERE id = $2`,
      [viewer, org.id],
    );

    const req2 = await sessionRequestFor(viewer, `http://localhost:3000/api/v1/org/${org.slug}`);
    const res2 = await GET(req2, { params: Promise.resolve({ slug: org.slug }) });
    expect(((await res2.json()) as OrgPageBody).claimEligible).toBe(false);
  });
});
