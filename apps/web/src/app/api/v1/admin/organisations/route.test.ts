import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPool } from "@learn-ai/db";
import { insertTestOrganisation, insertTestUser, sessionRequestFor } from "@/lib/test-helpers";
import { GET } from "./route";

// DB-backed tests. Skipped — not failed — when DATABASE_URL is unset.
const databaseUrl = process.env.DATABASE_URL;

interface AdminOrgListBody {
  organisations?: { id: string; autoCreated: boolean }[];
  error?: { code: string };
}

describe.skipIf(!databaseUrl)(
  "GET /api/v1/admin/organisations (§4.1 rename queue / T06 acceptance)",
  () => {
    beforeAll(() => {
      process.env.AUTH_SECRET ??= "integration-test-secret";
    });

    afterAll(async () => {
      await getPool().end();
    });

    it("an admin sees auto_created organisations when filtered", async () => {
      const admin = await insertTestUser(getPool(), { role: "admin" });
      const autoOrg = await insertTestOrganisation(getPool(), { autoCreated: true });

      const req = await sessionRequestFor(
        admin,
        "http://localhost:3000/api/v1/admin/organisations?auto_created=true",
      );
      const res = await GET(req);
      expect(res.status).toBe(200);
      const body = (await res.json()) as AdminOrgListBody;
      const ids = (body.organisations ?? []).map((o) => o.id);
      expect(ids).toContain(autoOrg.id);
      expect((body.organisations ?? []).every((o) => o.autoCreated)).toBe(true);
    });

    it("a member is forbidden (403) — admin-only route", async () => {
      const member = await insertTestUser(getPool());
      const req = await sessionRequestFor(
        member,
        "http://localhost:3000/api/v1/admin/organisations?auto_created=true",
      );
      const res = await GET(req);
      expect(res.status).toBe(403);
      const body = (await res.json()) as AdminOrgListBody;
      expect(body.error?.code).toBe("FORBIDDEN");
    });
  },
);
