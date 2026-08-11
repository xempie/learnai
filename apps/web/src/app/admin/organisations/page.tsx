import { revalidatePath } from "next/cache";
import { apiFetch, ApiClientError } from "@/lib/api-client";

/**
 * /admin/organisations — LEARN_AI_V1_BUILD_SPEC.md §4.1's admin rename
 * queue ("Auto-created organisations with derived names are flagged
 * `auto_created = true` and surfaced in an admin queue for Vala to
 * rename"), §12 T06 acceptance.
 *
 * Minimal and "keyboard-free" per the T06 controller brief: one list, one
 * inline text input + button per row, no shortcuts (unlike the reviewer
 * console in T13). Server component consuming only `apiFetch` (§2.1);
 * `GET /api/v1/admin/organisations` itself enforces `role: admin` via
 * `requireRole`, so a non-admin sees this page's error branch, not a
 * silently empty list.
 */

interface AdminOrgListResponse {
  organisations: {
    id: string;
    name: string;
    slug: string;
    primaryDomain: string;
    kind: string | null;
    memberCount: number;
    autoCreated: boolean;
    createdAt: string;
  }[];
}

async function renameOrganisation(formData: FormData): Promise<void> {
  "use server";
  const id = formData.get("id");
  const name = formData.get("name");
  if (typeof id !== "string" || typeof name !== "string" || name.trim().length === 0) {
    return;
  }
  await apiFetch(`/admin/organisations/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: name.trim() }),
  });
  revalidatePath("/admin/organisations");
}

export default async function AdminOrganisationsPage() {
  let data: AdminOrgListResponse;
  try {
    data = await apiFetch<AdminOrgListResponse>("/admin/organisations?auto_created=true");
  } catch (error) {
    if (error instanceof ApiClientError) {
      return (
        <main className="mx-auto max-w-3xl p-8">
          <p className="text-red-600">{error.message}</p>
        </main>
      );
    }
    throw error;
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
          Auto-created organisations
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          These organisation names were derived automatically from an email domain. Rename them to
          the organisation&apos;s proper name.
        </p>
      </div>

      {data.organisations.length === 0 ? (
        <p className="text-sm text-zinc-500">Nothing waiting for rename.</p>
      ) : (
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {data.organisations.map((org) => (
            <li key={org.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1 text-sm text-zinc-500">
                <div className="truncate">{org.primaryDomain}</div>
                <div>
                  {org.memberCount} member{org.memberCount === 1 ? "" : "s"}
                  {org.kind && <> · {org.kind}</>}
                </div>
              </div>
              <form action={renameOrganisation} className="flex items-center gap-2">
                <input type="hidden" name="id" value={org.id} />
                <input
                  type="text"
                  name="name"
                  defaultValue={org.name}
                  aria-label={`Name for ${org.primaryDomain}`}
                  className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                />
                <button
                  type="submit"
                  className="rounded bg-zinc-900 px-3 py-1 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-black"
                >
                  Rename
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
