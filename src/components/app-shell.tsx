"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  GraduationCap,
  LogOut,
  Newspaper,
  Settings,
  ShieldCheck,
  Sparkles,
  UserRound,
  Users,
} from "lucide-react";
import { useApiResource } from "@/components/notifications-view";
import { api } from "@/lib/api-client";
import { BRAND } from "@/lib/brand";
import { AVATAR_PRESETS } from "@/lib/constants";
import { Avatar } from "./avatar";
import { NotificationBell } from "./notification-bell";

/* ============================================================
   The `GET /api/v1/me` payload. snake_case, exactly as the API
   returns it - no client-side renaming, so the shapes stay
   greppable against the route handlers.
   ============================================================ */

export interface MeCategory {
  id: string;
  slug: string;
  name: string;
  color_hex: string;
  rank: number;
}

export interface MeOrganization {
  id: string;
  name: string;
  type: string;
  member_count: number | null;
  /** True when the cohort is below the display threshold - never show a number. */
  suppressed: boolean;
  is_visible: boolean;
  is_founding_member: boolean;
}

export interface MeEntitlements {
  tier: string;
  reason: string;
  unlimited_videos: boolean;
  certificates: boolean;
  leaderboards: boolean;
  streaks: boolean;
  trial_ends_at: string | null;
}

export interface Me {
  id: string;
  email: string;
  nickname: string;
  avatar_key: string | null;
  role: string;
  onboarded: boolean;
  email_verified: boolean;
  age_range: string | null;
  persona: string | null;
  skill_level: string;
  locale: string;
  timezone: string;
  created_at: string;
  organization: MeOrganization | null;
  subscription: MeEntitlements;
  entitlements: MeEntitlements;
  categories: MeCategory[];
}

interface CurrentUserValue {
  user: Me | null;
  loading: boolean;
  /** Null unless the profile request failed. Copy is safe to show as-is. */
  error: string | null;
  reload: () => void;
  /** Lets a page that just PATCHed /me push the fresh payload into the shell. */
  setUser: (user: Me) => void;
}

const CurrentUserContext = createContext<CurrentUserValue | null>(null);

/**
 * Every page under `(app)` renders inside <AppShell>, so this is always
 * available there. Throwing beats silently rendering a signed-out view.
 */
export function useCurrentUser(): CurrentUserValue {
  const ctx = useContext(CurrentUserContext);
  if (!ctx) throw new Error("useCurrentUser must be used inside <AppShell>.");
  return ctx;
}

/** Avatar keys are preset ids ("spark", "reef", ...); fall back to the first. */
export function avatarHue(avatarKey: string | null): number {
  return AVATAR_PRESETS.find((p) => p.id === avatarKey)?.hue ?? AVATAR_PRESETS[0].hue;
}

const ADMIN_ROLES = new Set(["content_reviewer", "platform_admin"]);

function trialDaysLeft(entitlements: MeEntitlements): number | null {
  if (entitlements.reason !== "trial" || !entitlements.trial_ends_at) return null;
  const ms = Date.parse(entitlements.trial_ends_at) - Date.now();
  if (Number.isNaN(ms) || ms <= 0) return null;
  return Math.max(1, Math.ceil(ms / 86_400_000));
}

/* ============================================================
   Navigation
   ============================================================ */

/** Primary destinations. Mobile bottom nav shows all four (spec: max 5). */
const NAV = [
  { href: "/feed", label: "Topics", icon: Newspaper },
  { href: "/org", label: "Cohort", icon: Users },
  { href: "/me", label: "Activity", icon: UserRound },
  { href: "/notifications", label: "Alerts", icon: Bell },
] as const;

const SECONDARY_NAV = [{ href: "/settings", label: "Settings", icon: Settings }] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const [signingOut, setSigningOut] = useState(false);

  const fetchMe = useCallback(() => api.get<Me>("/me"), []);
  const {
    data: user,
    loading,
    error,
    reload,
    setData,
  } = useApiResource<Me>(
    fetchMe,
    "We could not load your profile. Check your connection and try again.",
  );

  const setUser = useCallback((next: Me) => setData(next), [setData]);

  const value = useMemo<CurrentUserValue>(
    () => ({ user, loading, error, reload, setUser }),
    [user, loading, error, reload, setUser],
  );

  async function signOut() {
    setSigningOut(true);
    try {
      await api.post<void>("/auth/logout");
    } catch {
      // Logout is idempotent server-side; a failure here must not trap anyone
      // on a page they are trying to leave.
    }
    router.push("/login");
    router.refresh();
  }

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  const isAdmin = user !== null && ADMIN_ROLES.has(user.role);
  // SERVICES_ACTION_PLAN §1: nobody is on a countdown while the platform is
  // free for everyone - reason is "free_platform" for every user in that case.
  const daysLeft =
    user && user.entitlements.reason !== "free_platform" ? trialDaysLeft(user.entitlements) : null;

  return (
    <CurrentUserContext.Provider value={value}>
      <div className="flex min-h-dvh w-full">
        {/* ===== Desktop sidebar ===== */}
        <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-line bg-surface px-4 py-6 lg:flex">
          <div className="flex items-center justify-between gap-2 px-2">
            <Link
              href="/feed"
              className="flex items-center gap-2 font-display text-xl font-bold text-ink"
            >
              <span className="flex size-9 items-center justify-center rounded-md bg-primary text-on-primary">
                <GraduationCap className="size-5" aria-hidden="true" />
              </span>
              {BRAND.name}
            </Link>
            <NotificationBell />
          </div>

          <nav aria-label="Main" className="mt-8 flex flex-col gap-1">
            {NAV.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                aria-current={isActive(href) ? "page" : undefined}
                className={`flex min-h-11 items-center gap-3 rounded-md px-3 font-medium transition-colors duration-150 ${
                  isActive(href)
                    ? "bg-primary-soft font-semibold text-primary-strong"
                    : "text-ink-muted hover:bg-band hover:text-ink"
                }`}
              >
                <Icon className="size-5" aria-hidden="true" />
                {label}
              </Link>
            ))}

            <span className="my-2 h-px bg-line" aria-hidden="true" />

            {SECONDARY_NAV.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                aria-current={isActive(href) ? "page" : undefined}
                className={`flex min-h-11 items-center gap-3 rounded-md px-3 font-medium transition-colors duration-150 ${
                  isActive(href)
                    ? "bg-primary-soft font-semibold text-primary-strong"
                    : "text-ink-muted hover:bg-band hover:text-ink"
                }`}
              >
                <Icon className="size-5" aria-hidden="true" />
                {label}
              </Link>
            ))}

            {/* Reviewers and platform admins only - hidden for everyone else. */}
            {isAdmin && (
              <Link
                href="/admin"
                aria-current={isActive("/admin") ? "page" : undefined}
                className="flex min-h-11 items-center gap-3 rounded-md px-3 font-medium text-ink-muted transition-colors duration-150 hover:bg-band hover:text-ink"
              >
                <ShieldCheck className="size-5" aria-hidden="true" />
                Admin
              </Link>
            )}
          </nav>

          <div className="mt-auto flex flex-col gap-4">
            {daysLeft !== null && (
              <div className="rounded-md border border-line bg-band p-3 text-sm">
                <p className="flex items-center gap-1.5 font-semibold text-ink">
                  <Sparkles className="size-4 text-primary-strong" aria-hidden="true" />
                  Trial · {daysLeft} {daysLeft === 1 ? "day" : "days"} left
                </p>
                <Link
                  href="/settings#subscription"
                  className="mt-2 inline-flex min-h-9 w-full items-center justify-center rounded-md bg-primary px-3 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-strong"
                >
                  Upgrade - $9/mo
                </Link>
              </div>
            )}

            {loading && (
              <div
                aria-hidden="true"
                className="flex items-center gap-3 rounded-md px-2 py-1.5"
              >
                <span className="size-10 shrink-0 animate-pulse rounded-full bg-band" />
                <span className="min-w-0 flex-1">
                  <span className="block h-4 w-24 animate-pulse rounded bg-band" />
                  <span className="mt-1.5 block h-3 w-32 animate-pulse rounded bg-band" />
                </span>
              </div>
            )}

            {!loading && error && (
              <div className="rounded-md border border-line bg-band p-3 text-sm">
                <p className="font-medium text-ink-muted">{error}</p>
                <button
                  type="button"
                  onClick={reload}
                  className="mt-2 inline-flex min-h-9 items-center rounded-md border border-line px-3 text-sm font-semibold text-ink transition-colors hover:border-primary hover:text-primary-strong"
                >
                  Try again
                </button>
              </div>
            )}

            {!loading && user && (
              <>
                <Link
                  href="/settings"
                  className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-band"
                >
                  <Avatar name={user.nickname} hue={avatarHue(user.avatar_key)} />
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{user.nickname}</span>
                    <span className="block truncate text-sm text-ink-faint">
                      {user.organization?.name ?? "No organisation"}
                    </span>
                  </span>
                </Link>
                <button
                  type="button"
                  onClick={() => void signOut()}
                  disabled={signingOut}
                  className="flex min-h-11 items-center gap-3 rounded-md px-3 font-medium text-ink-muted transition-colors duration-150 hover:bg-band hover:text-ink disabled:opacity-60"
                >
                  <LogOut className="size-5" aria-hidden="true" />
                  {signingOut ? "Signing out…" : "Sign out"}
                </button>
              </>
            )}
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* ===== Mobile top bar ===== */}
          <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-line bg-surface/95 px-4 py-2.5 backdrop-blur lg:hidden">
            <Link
              href="/feed"
              className="flex items-center gap-2 font-display text-lg font-bold text-ink"
            >
              <span className="flex size-8 items-center justify-center rounded-md bg-primary text-on-primary">
                <GraduationCap className="size-4.5" aria-hidden="true" />
              </span>
              {BRAND.name}
            </Link>
            <div className="flex items-center gap-1">
              <NotificationBell />
            </div>
          </header>

          {/* ===== Page content ===== */}
          <main className="mx-auto w-full page-container flex-1 px-4 pb-28 pt-6 sm:px-6 lg:px-10 lg:pb-12">
            {children}
          </main>

          {/* ===== Mobile bottom nav ===== */}
          <nav
            aria-label="Main"
            className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
          >
            <ul className="flex">
              {NAV.map(({ href, label, icon: Icon }) => (
                <li key={href} className="flex-1">
                  <Link
                    href={href}
                    aria-current={isActive(href) ? "page" : undefined}
                    className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-semibold ${
                      isActive(href) ? "text-primary-strong" : "text-ink-faint"
                    }`}
                  >
                    <Icon className="size-6" aria-hidden="true" />
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>
    </CurrentUserContext.Provider>
  );
}
