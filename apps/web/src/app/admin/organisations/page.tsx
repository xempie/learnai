import type { Metadata } from "next";
import { OrganisationsTable } from "@/app/admin/organisations/organisations-table";
import { getPendingOrganisations } from "@/lib/data-source";

export const metadata: Metadata = {
  title: "Organisations · Learn AI Admin",
};

/**
 * `/admin/organisations` — LEARN_AI_V1_BUILD_SPEC.md §4.1's admin rename
 * queue, restyled to the dense admin design system, sample-data mode.
 *
 * SAMPLE-DATA ONLY, deliberately, same reasoning as `/org/[slug]`: the real
 * page (T06, already shipped) read `GET /api/v1/admin/organisations` via
 * `apiFetch`, which needs a signed-in admin session cookie this
 * sample-data-only build phase doesn't have. T06's acceptance tests
 * (`app/api/v1/admin/organisations/**\/route.test.ts`) exercise the API
 * routes directly, not this page component, so they're unaffected by this
 * rewrite.
 */
export default async function AdminOrganisationsPage() {
  const organisations = await getPendingOrganisations();

  return (
    <div className="space-y-4 p-4 md:p-6">
      <header>
        <h2 className="font-heading text-lg font-semibold text-foreground">Auto-created organisations</h2>
        <p className="mt-0.5 max-w-2xl text-xs text-muted">
          These organisation names were derived automatically from an email domain. Rename them to the
          organisation&apos;s proper name.
        </p>
      </header>

      <OrganisationsTable organisations={organisations} />
    </div>
  );
}
