import type { ReactNode } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { getCurrentReviewer, getReviewQueue } from "@/lib/data-source";

/**
 * Shared shell for every `/admin/*` route (§8 admin route shapes) — sidebar
 * nav + reviewer identity + queue badge, fetched once here instead of in
 * every page. `AppShell` (root layout) hands off entirely to this for
 * `/admin/*`, so this is the only chrome admin pages get.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const [reviewer, queue] = await Promise.all([getCurrentReviewer(), getReviewQueue()]);

  return (
    <AdminShell reviewer={reviewer} reviewQueueCount={queue.length}>
      {children}
    </AdminShell>
  );
}
