"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ComponentType, type ReactNode } from "react";
import {
  ArrowLeftIcon,
  Building2Icon,
  ChartLineIcon,
  ClipboardCheckIcon,
  MenuIcon,
  RssIcon,
  XIcon,
  type IconProps,
} from "@/components/icons";
import { ThemeToggle } from "@/components/theme-toggle";
import type { AdminReviewer } from "@/lib/sample-data";

interface AdminNavItem {
  key: string;
  label: string;
  href: string;
  Icon: ComponentType<IconProps>;
  badge?: number;
}

/**
 * Admin's own left-sidebar shell — LEARN_AI_V1_BUILD_SPEC.md §8 admin route
 * shapes + design-system/pages/admin-review.md's dense-dashboard override.
 * Deliberately NOT the member `AppShell` bottom-tab nav: `AppShell` itself
 * detects `/admin/*` and hands off entirely to whatever this component
 * renders (see `components/app-shell.tsx`).
 *
 * `data-density="dense"` documents the 8–32px dense-dashboard spacing
 * scale this shell and its pages use (vs. the member surfaces' more
 * generous reading-surface spacing) — every admin page keeps padding/gaps
 * inside that range rather than the roomier `p-6`/`p-8` member pattern.
 */
export function AdminShell({
  children,
  reviewer,
  reviewQueueCount,
}: {
  children: ReactNode;
  reviewer: AdminReviewer;
  reviewQueueCount: number;
}) {
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const navItems: AdminNavItem[] = [
    { key: "review", label: "Review", href: "/admin/review", Icon: ClipboardCheckIcon, badge: reviewQueueCount },
    { key: "metrics", label: "Metrics", href: "/admin/metrics", Icon: ChartLineIcon },
    { key: "organisations", label: "Organisations", href: "/admin/organisations", Icon: Building2Icon },
    { key: "sources", label: "Sources", href: "/admin/sources", Icon: RssIcon },
  ];

  function isActive(href: string): boolean {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  const activeItem = navItems.find((item) => isActive(item.href));

  const navContent = (
    <>
      <div className="px-4 py-5">
        <Link href="/admin/review" className="font-heading text-lg font-semibold text-primary">
          Learn AI
        </Link>
        <p className="mt-0.5 text-xs font-medium tracking-wide text-muted uppercase">Admin</p>
      </div>
      <nav aria-label="Admin" className="flex-1 space-y-1 px-2">
        {navItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={active ? "page" : undefined}
              onClick={() => setMobileNavOpen(false)}
              className={`flex cursor-pointer items-center justify-between gap-2 rounded-control px-3 py-2 text-sm font-medium transition-colors duration-200 ${
                active ? "bg-primary text-on-primary" : "text-muted hover:bg-line/60 hover:text-foreground"
              }`}
            >
              <span className="flex items-center gap-2">
                <item.Icon size={17} />
                {item.label}
              </span>
              {!!item.badge && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
                    active ? "bg-on-primary/20 text-on-primary" : "bg-accent/15 text-accent"
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-line px-4 py-4">
        <p className="truncate text-sm font-medium text-foreground">{reviewer.displayName}</p>
        <p className="text-xs text-muted capitalize">{reviewer.role}</p>
        <Link
          href="/"
          className="mt-3 inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-muted transition-colors duration-200 hover:text-primary"
        >
          <ArrowLeftIcon size={13} />
          Back to member app
        </Link>
      </div>
    </>
  );

  return (
    <div data-density="dense" className="flex min-h-dvh bg-background text-foreground">
      <a
        href="#admin-main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-control focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-on-primary"
      >
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-line bg-surface md:flex">{navContent}</aside>

      {/* Mobile slide-over nav */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Admin navigation">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileNavOpen(false)} />
          <div className="relative flex h-full w-64 flex-col bg-surface shadow-xl">
            <button
              type="button"
              onClick={() => setMobileNavOpen(false)}
              aria-label="Close navigation"
              className="absolute top-4 right-3 cursor-pointer rounded-control p-1.5 text-muted transition-colors duration-200 hover:text-foreground"
            >
              <XIcon size={18} />
            </button>
            {navContent}
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-2.5 md:px-6">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation"
              className="cursor-pointer rounded-control p-1.5 text-muted transition-colors duration-200 hover:text-foreground md:hidden"
            >
              <MenuIcon size={20} />
            </button>
            <h1 className="font-heading text-base font-semibold text-foreground">{activeItem?.label ?? "Admin"}</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-muted sm:inline">
              Signed in as <span className="font-medium text-foreground">{reviewer.displayName}</span>
            </span>
            <ThemeToggle />
          </div>
        </header>

        <main id="admin-main" className="min-w-0 flex-1 overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
