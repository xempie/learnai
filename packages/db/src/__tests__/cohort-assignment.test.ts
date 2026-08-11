import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { assignCohort } from "../cohort-assignment.js";
import { getPool, newId } from "../client.js";
import { seed } from "../seed.js";
import { requireDatabaseUrl } from "./test-helpers.js";

// DB-backed tests for T05 (§4.1 cohort assignment). Skipped — not failed —
// when DATABASE_URL is unset, same pattern as
// packages/db/src/__tests__/migrate-and-constraints.test.ts. CI's postgres
// service already has the schema migrated up before `pnpm test` runs (see
// .github/workflows/ci.yml), but the domain lookup tables are only seeded
// by CI *after* the test step — so, exactly like the "seed script" describe
// block in migrate-and-constraints.test.ts, this file seeds itself in
// beforeAll (seed() is idempotent, safe to call repeatedly).
const databaseUrl = requireDatabaseUrl();

interface OrganisationRow {
  id: string;
  name: string;
  slug: string;
  primary_domain: string;
  kind: string;
  auto_created: boolean;
  member_count: number;
}

async function fetchOrganisation(id: string): Promise<OrganisationRow | null> {
  const { rows } = await getPool().query<OrganisationRow>(
    `SELECT id, name, slug, primary_domain, kind, auto_created, member_count
       FROM organisations WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

async function insertUser(email: string, organisationId: string | null): Promise<string> {
  const id = newId();
  await getPool().query(
    `INSERT INTO users (id, email, email_domain, cohort_track, organisation_id)
       VALUES ($1, $2, split_part($2, '@', 2), $3, $4)`,
    [id, email, organisationId ? "organisation" : "individual", organisationId],
  );
  return id;
}

describe.skipIf(!databaseUrl)("assignCohort (§4.1 / T05)", () => {
  beforeAll(async () => {
    await seed();
  });

  afterAll(async () => {
    await getPool().end();
  });

  it("§12 T05 acceptance: x@mq.edu.au joins the existing Macquarie org (known_institutions)", async () => {
    const first = await assignCohort(`first-${newId()}@mq.edu.au`);
    expect(first.cohortTrack).toBe("organisation");
    expect(first.organisationId).not.toBeNull();

    const org = await fetchOrganisation(first.organisationId as string);
    expect(org).toMatchObject({
      name: "Macquarie University",
      kind: "university",
      primary_domain: "mq.edu.au",
      // The name is already authoritative (from known_institutions), not a
      // deriveName() guess — no reason to put it in the rename queue.
      auto_created: false,
    });

    const second = await assignCohort(`second-${newId()}@mq.edu.au`);
    expect(second.cohortTrack).toBe("organisation");
    expect(second.organisationId).toBe(first.organisationId);
  });

  it("§12 T05 acceptance: x@newco.com.au auto-creates an organisation flagged auto_created", async () => {
    const domain = `newco-${newId()}.com.au`;
    const result = await assignCohort(`x@${domain}`);
    expect(result.cohortTrack).toBe("organisation");
    expect(result.organisationId).not.toBeNull();

    const org = await fetchOrganisation(result.organisationId as string);
    expect(org).toMatchObject({
      primary_domain: domain,
      kind: "corporate",
      auto_created: true,
    });
    expect(org?.name).toBeTruthy();
    expect(org?.slug).toBeTruthy();
  });

  it("§12 T05 acceptance: x@gmail.com gets the individual track with no organisation", async () => {
    const result = await assignCohort(`x-${newId()}@gmail.com`);
    expect(result).toEqual({ organisationId: null, cohortTrack: "individual" });
  });

  it("§12 T05 acceptance: assignment failure (a throwing DB call) never blocks signup", async () => {
    const querySpy = vi
      .spyOn(getPool(), "query")
      .mockRejectedValueOnce(new Error("simulated DB failure"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await assignCohort(`fail-${newId()}@brand-new-failure-domain.com.au`);
    expect(result).toEqual({ organisationId: null, cohortTrack: "individual" });
    expect(errorSpy).toHaveBeenCalled();

    querySpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("disposable domain -> rejected, no organisation, individual track", async () => {
    const result = await assignCohort(`x-${newId()}@mailinator.com`);
    expect(result).toEqual({
      organisationId: null,
      cohortTrack: "individual",
      rejected: "disposable",
    });
  });

  it("nsw.gov.au longest-suffix wrinkle: health and education resolve to two distinct organisations", async () => {
    const health = await assignCohort(`staff-${newId()}@health.nsw.gov.au`);
    const education = await assignCohort(`staff-${newId()}@education.nsw.gov.au`);

    expect(health.cohortTrack).toBe("organisation");
    expect(education.cohortTrack).toBe("organisation");
    expect(health.organisationId).not.toBe(education.organisationId);

    const healthOrg = await fetchOrganisation(health.organisationId as string);
    const educationOrg = await fetchOrganisation(education.organisationId as string);
    expect(healthOrg).toMatchObject({
      name: "NSW Health",
      kind: "government",
      primary_domain: "health.nsw.gov.au",
      auto_created: false,
    });
    expect(educationOrg).toMatchObject({
      name: "NSW Department of Education",
      kind: "government",
      primary_domain: "education.nsw.gov.au",
      auto_created: false,
    });

    // A subdomain of one of the two must resolve to that institution, not
    // to the PSL registrable domain (`nsw.gov.au`) both would otherwise
    // collapse into (see this file's cohort-assignment.ts header comment).
    const subdomain = await assignCohort(`x-${newId()}@mail.health.nsw.gov.au`);
    expect(subdomain.organisationId).toBe(health.organisationId);
  });

  it("concurrency-safe find-or-create: two simultaneous signups from the same new domain create ONE org, member_count 2", async () => {
    const domain = `concurrent-${newId()}.com.au`;

    const [resultA, resultB] = await Promise.all([
      assignCohort(`alice@${domain}`),
      assignCohort(`bob@${domain}`),
    ]);

    expect(resultA.cohortTrack).toBe("organisation");
    expect(resultB.cohortTrack).toBe("organisation");
    expect(resultA.organisationId).not.toBeNull();
    expect(resultA.organisationId).toBe(resultB.organisationId);

    const orgDomains = await getPool().query<{ count: number }>(
      `SELECT count(*)::int AS count FROM organisation_domains WHERE domain = $1`,
      [domain],
    );
    expect(orgDomains.rows[0]?.count).toBe(1);

    // Exercise the member_count trigger end to end: insert the two users the
    // signup flow would have created with this assignment.
    const organisationId = resultA.organisationId as string;
    const userA = await insertUser(`alice@${domain}`, organisationId);
    const userB = await insertUser(`bob@${domain}`, organisationId);

    const afterInsert = await fetchOrganisation(organisationId);
    expect(afterInsert?.member_count).toBe(2);

    // member_count trigger on delete: removing one user decrements the count.
    await getPool().query(`DELETE FROM users WHERE id = $1`, [userA]);
    const afterDelete = await fetchOrganisation(organisationId);
    expect(afterDelete?.member_count).toBe(1);

    await getPool().query(`DELETE FROM users WHERE id = $1`, [userB]);
    const afterSecondDelete = await fetchOrganisation(organisationId);
    expect(afterSecondDelete?.member_count).toBe(0);
  });
});
