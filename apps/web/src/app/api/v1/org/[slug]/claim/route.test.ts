import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPool } from "@learn-ai/db";
import { insertTestOrganisation, insertTestUser, sessionRequestFor } from "@/lib/test-helpers";
import { POST } from "./route";

// DB-backed tests. Skipped — not failed — when DATABASE_URL is unset.
const databaseUrl = process.env.DATABASE_URL;

interface ClaimBody {
  id?: string;
  status?: string;
  error?: { code: string };
}

async function claimRequest(userId: string, slug: string) {
  const req = await sessionRequestFor(userId, `http://localhost:3000/api/v1/org/${slug}/claim`, {
    method: "POST",
  });
  return POST(req, { params: Promise.resolve({ slug }) });
}

describe.skipIf(!databaseUrl)("POST /api/v1/org/[slug]/claim (§4.2 / §8 / T06 acceptance)", () => {
  beforeAll(() => {
    process.env.AUTH_SECRET ??= "integration-test-secret";
  });

  afterAll(async () => {
    await getPool().end();
  });

  it("a member of an unclaimed organisation can claim it", async () => {
    const org = await insertTestOrganisation(getPool());
    const member = await insertTestUser(getPool(), { organisationId: org.id });

    const res = await claimRequest(member, org.slug);
    expect(res.status).toBe(201);
    const body = (await res.json()) as ClaimBody;
    expect(body.status).toBe("pending");

    const { rows } = await getPool().query<{ status: string }>(
      `SELECT status FROM organisation_claims WHERE organisation_id = $1 AND user_id = $2`,
      [org.id, member],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("pending");
  });

  it("409s when the same user claims again while a pending claim exists", async () => {
    const org = await insertTestOrganisation(getPool());
    const member = await insertTestUser(getPool(), { organisationId: org.id });

    const first = await claimRequest(member, org.slug);
    expect(first.status).toBe(201);

    const second = await claimRequest(member, org.slug);
    expect(second.status).toBe(409);
    const body = (await second.json()) as ClaimBody;
    expect(body.error?.code).toBe("CLAIM_ALREADY_PENDING");
  });

  it("409s when the organisation is already claimed by someone else", async () => {
    const org = await insertTestOrganisation(getPool());
    const firstClaimant = await insertTestUser(getPool(), { organisationId: org.id });
    await getPool().query(
      `UPDATE organisations SET claimed_by = $1, claimed_at = now() WHERE id = $2`,
      [firstClaimant, org.id],
    );

    const member = await insertTestUser(getPool(), { organisationId: org.id });
    const res = await claimRequest(member, org.slug);
    expect(res.status).toBe(409);
    const body = (await res.json()) as ClaimBody;
    expect(body.error?.code).toBe("ORGANISATION_ALREADY_CLAIMED");
  });

  it("a non-member cannot claim (403)", async () => {
    const orgA = await insertTestOrganisation(getPool());
    const orgB = await insertTestOrganisation(getPool());
    const outsider = await insertTestUser(getPool(), { organisationId: orgB.id });

    const res = await claimRequest(outsider, orgA.slug);
    expect(res.status).toBe(403);
  });
});
