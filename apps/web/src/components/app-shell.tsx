"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState, type ComponentType, type ReactNode } from "react";
import {
  CalendarDaysIcon,
  HouseIcon,
  type IconProps,
  MessageSquareIcon,
  UserIcon,
  UsersIcon,
} from "@/components/icons";
import { StreakBadge } from "@/components/streak-badge";
import { StreakBumpContext } from "@/components/streak-context";
import { ThemeToggle } from "@/components/theme-toggle";

interface NavItem {
  key: string;
  label: string;
  href: string;
  Icon: ComponentType<IconProps>;
}

/**
 * App shell: bottom tab nav on mobile (≤5 items), top bar with the same
 * items on desktop — per the design-system nav rules. `cohortHref` is
 * passed in from the server layout because it depends on the current
 * user's organisation (sample data today; a real session later).
 */
export function AppShell({
  children,
  cohortHref,
  streak,
}: {
  children: ReactNode;
  cohortHref: string;
  streak: number;
}) {
  const pathname = usePathname();
  const [streakCount, setStreakCount] = useState(streak);
  const [pulse, setPulse] = useState(false);
  const pulseTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Admin routes (design-system/pages/admin-review.md: dense-dashboard
  // override) get their own left-sidebar shell — `AdminShell` — rather
  // than the member masthead/bottom-tab chrome below. This early return
  // keeps that decision in one place instead of threading an "isAdmin"
  // flag through every render branch further down.
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return <div className="min-h-dvh bg-background text-foreground">{children}</div>;
  }

  function bumpStreak() {
    setStreakCount((count) => count + 1);
    setPulse(true);
    if (pulseTimeout.current) clearTimeout(pulseTimeout.current);
    pulseTimeout.current = setTimeout(() => setPulse(false), 500);
  }

  const navItems: NavItem[] = [
    { key: "today", label: "Today", href: "/", Icon: HouseIcon },
    { key: "archive", label: "Archive", href: "/archive", Icon: CalendarDaysIcon },
    { key: "prompts", label: "Prompts", href: "/prompts", Icon: MessageSquareIcon },
    { key: "cohort", label: "Cohort", href: cohortHref, Icon: UsersIcon },
    { key: "me", label: "Me", href: "/me", Icon: UserIcon },
  ];

  function isActive(href: string): boolean {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <StreakBumpContext.Provider value={bumpStreak}>
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      {/* Mobile masthead — wordmark + streak + theme toggle. Nav itself
          lives in the fixed bottom bar below. */}
      <header
        className="flex items-center justify-between border-b border-line bg-surface px-4 py-3 md:hidden"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <Link href="/" className="font-heading text-lg font-semibold text-primary">
          Learn AI
        </Link>
        <div className="flex items-center gap-2">
          <StreakBadge streak={streakCount} pulse={pulse} />
          <ThemeToggle />
        </div>
      </header>

      {/* Desktop top bar — wordmark, nav, streak, theme toggle all in one row. */}
      <header className="hidden items-center justify-between border-b border-line bg-surface px-6 py-3 md:flex">
        <Link href="/" className="font-heading text-xl font-semibold text-primary">
          Learn AI
        </Link>
        <nav aria-label="Primary" className="flex items-center gap-1">
          {navItems.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={`cursor-pointer rounded-control px-3 py-2 text-sm font-medium transition-colors duration-200 ${
                isActive(item.href)
                  ? "bg-primary text-on-primary"
                  : "text-muted hover:bg-line/60 hover:text-foreground"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <StreakBadge streak={streakCount} pulse={pulse} />
          <ThemeToggle />
        </div>
      </header>

      {/* Bottom padding on mobile keeps content clear of the fixed tab bar. */}
      <main className="flex-1 pb-20 md:pb-0">{children}</main>

      {/* Mobile bottom tab nav. */}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-10 flex border-t border-line bg-surface md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {navItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex flex-1 cursor-pointer flex-col items-center gap-0.5 py-2 text-xs font-medium transition-colors duration-200 ${
                active ? "text-primary" : "text-muted"
              }`}
            >
              <item.Icon size={20} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
    </StreakBumpContext.Provider>
  );
}
