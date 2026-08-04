import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { AdminHeader } from "@/components/admin/admin-header";
import { BRAND } from "@/lib/brand";
import { getCurrentUser, isAdminRole } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: `Admin · ${BRAND.name}`,
  description: "Content, categories, moderation, users and analytics.",
};

/**
 * Session claims are read per request, so this whole subtree must be dynamic -
 * a cached admin shell would be served to whoever asked for it next.
 */
export const dynamic = "force-dynamic";

/**
 * The role gate for every /admin page.
 *
 * Middleware only proves the visitor is signed in; it does not know their role.
 * Without this check an ordinary learner could open /admin and browse the full
 * admin interface. The API routes each call requireAdmin, so no data ever
 * leaked, but the structure of the admin surface did.
 *
 * notFound() rather than a redirect or a 403, to match what the admin APIs
 * already do for non-admins: to someone without the role, /admin simply does
 * not exist.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user || !isAdminRole(user.role)) notFound();

  return (
    /**
     * `admin-theme` swaps the palette for RoniDoc's - see globals.css. It sits
     * on the outermost element so every descendant, including portalled
     * dialogs, inherits the variables.
     *
     * The shell itself is RoniDoc's: fixed-height sidebar rail, content column
     * that scrolls on its own, and a 56px header above it.
     */
    <div className="admin-theme flex min-h-dvh">
      <AdminSidebar
        userEmail={user.email}
        userNickname={user.nickname}
        userRole={user.role}
      />

      {/* min-w-0 or a wide table inside will stretch the column and force the
          whole page to scroll sideways. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminHeader />
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
