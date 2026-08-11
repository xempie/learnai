import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPool, newId, slugify } from "@learn-ai/db";
import { insertTestOrganisation, insertTestUser, sessionRequestFor } from "@/lib/test-helpers";
import { PATCH } from "./route";

// DB-backed tests. Skipped — not failed — when DATABASE_URL is unset.
const databaseUrl = process.env.DATABASE_URL;

interface RenameBody {
  id?: string;
  name?: string;
  slug?: string;
  error?: { code: string };
}

describe.skipIf(!databaseUrl)(
  "PATCH /api/v1/admin/organisations/[id] (§4.1 rename queue / T06 acceptance)",
  () => {
    beforeAll(() => {
      process.env.AUTH_SECRET ??= "integration-test-secret";
    });

    afterAll(async () => {
      await getPool().end();
    });

    it("an admin can rename an organisation and its slug is safely re-derived", async () => {
      const admin = await insertTestUser(getPool(), { role: "admin" });
      const org = await insertTestOrganisation(getPool(), { name: "Newco Pty Ltd" });
      const newName = `Acme Corporation ${newId()}`;

      const req = await sessionRequestFor(
        admin,
        `http://localhost:3000/api/v1/admin/organisations/${org.id}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: newName }),
        },
      );
      const res = await PATCH(req, { params: Promise.resolve({ id: org.id }) });
      expect(res.status).toBe(200);
      const body = (await res.json()) as RenameBody;
      expect(body.name).toBe(newName);
      expect(body.slug).toBe(slugify(newName));

      const { rows } = await getPool().query<{ name: string; slug: string }>(
        `SELECT name, slug FROM organisations WHERE id = $1`,
        [org.id],
      );
      expect(rows[0]).toMatchObject({ name: newName, slug: slugify(newName) });
    });

    it("re-slugs on a slug collision by appending a numeric suffix", async () => {
      const admin = await insertTestUser(getPool(), { role: "admin" });
      const sharedName = `Shared Name ${newId()}`;
      const taken = await insertTestOrganisation(getPool(), {
        name: sharedName,
        slug: slugify(sharedName),
      });
      const org = await insertTestOrganisation(getPool());

      const req = await sessionRequestFor(
        admin,
        `http://localhost:3000/api/v1/admin/organisations/${org.id}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: sharedName }),
        },
      );
      const res = await PATCH(req, { params: Promise.resolve({ id: org.id }) });
      expect(res.status).toBe(200);
      const body = (await res.json()) as RenameBody;
      expect(body.slug).not.toBe(taken.slug);
      expect(body.slug).toBe(`${slugify(sharedName)}-2`);
    });

    it("requires admin role — a member gets 403", async () => {
      const member = await insertTestUser(getPool());
      const org = await insertTestOrganisation(getPool());

      const req = await sessionRequestFor(
        member,
        `http://localhost:3000/api/v1/admin/organisations/${org.id}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: "New Name" }),
        },
      );
      const res = await PATCH(req, { params: Promise.resolve({ id: org.id }) });
      expect(res.status).toBe(403);
      const body = (await res.json()) as RenameBody;
      expect(body.error?.code).toBe("FORBIDDEN");
    });

    it("404s for a non-existent organisation id", async () => {
      const admin = await insertTestUser(getPool(), { role: "admin" });

      const req = await sessionRequestFor(
        admin,
        `http://localhost:3000/api/v1/admin/organisations/${newId()}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: "Doesn't matter" }),
        },
      );
      const res = await PATCH(req, { params: Promise.resolve({ id: newId() }) });
      expect(res.status).toBe(404);
    });
  },
);
