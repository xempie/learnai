"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";

/**
 * The 56px bar above the content column, matching RoniDoc's panel header:
 * a breadcrumb on the left, actions on the right.
 *
 * The sidebar owns navigation, so this deliberately stays thin - it exists to
 * tell you where you are, which the sidebar cannot do once you are two levels
 * deep (a topic editor, say).
 */

const LABELS: Record<string, string> = {
  admin: "Analytics",
  content: "Topics",
  categories: "Categories",
  moderation: "Moderation",
  users: "Users",
  coupons: "Coupons",
  topics: "Topics",
  new: "New topic",
};

/** UUIDs in the path are row ids, not names - show a neutral label instead. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Crumb {
  label: string;
  href: string;
}

function crumbsFor(pathname: string): Crumb[] {
  const parts = pathname.replace(/\/+$/, "").split("/").filter(Boolean);
  const crumbs: Crumb[] = [];
  let href = "";

  for (const part of parts) {
    href += `/${part}`;
    if (part === "admin") {
      crumbs.push({ label: "Admin", href: "/admin" });
      continue;
    }
    crumbs.push({
      label: UUID.test(part) ? "Edit" : (LABELS[part] ?? part.replace(/-/g, " ")),
      href,
    });
  }
  return crumbs;
}

export function AdminHeader() {
  const pathname = usePathname();
  const crumbs = crumbsFor(pathname);

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface px-4 md:px-6">
      <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
        <ol className="flex items-center gap-1 overflow-hidden text-sm">
          {crumbs.map((crumb, i) => {
            const last = i === crumbs.length - 1;
            return (
              <li key={crumb.href} className="flex min-w-0 items-center gap-1">
                {i > 0 && (
                  <ChevronRight className="size-3.5 shrink-0 text-ink-faint" aria-hidden="true" />
                )}
                {last ? (
                  <span aria-current="page" className="truncate font-semibold text-ink">
                    {crumb.label}
                  </span>
                ) : (
                  <Link
                    href={crumb.href}
                    className="truncate text-ink-faint transition-colors hover:text-ink"
                  >
                    {crumb.label}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    </header>
  );
}
