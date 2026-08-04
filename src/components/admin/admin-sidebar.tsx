"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { api } from "@/lib/api-client";
import {
  ChevronsUpDown,
  ClipboardCheck,
  Cog,
  ExternalLink,
  FileText,
  GraduationCap,
  Inbox,
  LayoutDashboard,
  LogOut,
  PanelLeftClose,
  PanelLeft,
  ShieldAlert,
  Tags,
  Ticket,
  Users,
} from "lucide-react";

/**
 * Admin sidebar, modelled on RoniDoc's panel: a collapsible rail with the
 * product mark at the top, nav in labelled groups, and the signed-in user in a
 * footer menu.
 *
 * Collapse state is persisted, because an admin who works on a laptop collapses
 * it once and expects it to stay that way.
 */

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [{ href: "/admin", label: "Analytics", icon: LayoutDashboard }],
  },
  {
    label: "Content",
    items: [
      { href: "/admin/content", label: "Topics", icon: FileText },
      { href: "/admin/categories", label: "Categories", icon: Tags },
      { href: "/admin/drafts", label: "Drafts", icon: ClipboardCheck },
    ],
  },
  {
    label: "Community",
    items: [
      { href: "/admin/moderation", label: "Moderation", icon: ShieldAlert },
      { href: "/admin/users", label: "Users", icon: Users },
    ],
  },
  {
    label: "Growth",
    items: [
      { href: "/admin/leads", label: "Leads", icon: Inbox },
      { href: "/admin/coupons", label: "Coupons", icon: Ticket },
    ],
  },
];

const STORAGE_KEY = "acadu:admin:sidebar-collapsed";

/**
 * Collapse state lives in localStorage so it survives navigation, but the
 * server cannot read it. Rather than set state from an effect - which renders
 * once with the wrong value and immediately again with the right one - it is
 * exposed as an external store: the server snapshot is "expanded", and the
 * client reads the real value during its first render.
 */
const listeners = new Set<() => void>();
let cached: boolean | null = null;

function subscribeCollapsed(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

function readCollapsed(): boolean {
  cached ??= window.localStorage.getItem(STORAGE_KEY) === "1";
  return cached;
}

/** Sidebars are expanded until proven otherwise. */
function readCollapsedOnServer(): boolean {
  return false;
}

function writeCollapsed(next: boolean): void {
  cached = next;
  window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
  for (const listener of listeners) listener();
}

function useIsActive() {
  const pathname = usePathname();
  return (href: string) => {
    const path = pathname.replace(/\/+$/, "") || "/";
    if (href === "/admin") return path === "/admin";
    // The topic editor lives at /admin/topics/[id] but belongs to Topics.
    if (href === "/admin/content" && path.startsWith("/admin/topics")) return true;
    return path === href || path.startsWith(`${href}/`);
  };
}

export interface AdminSidebarProps {
  userEmail: string;
  userNickname: string | null;
  userRole: string;
}

export function AdminSidebar({ userEmail, userNickname, userRole }: AdminSidebarProps) {
  const isActive = useIsActive();
  const router = useRouter();
  const collapsed = useSyncExternalStore(
    subscribeCollapsed,
    readCollapsed,
    readCollapsedOnServer,
  );
  const [menuOpen, setMenuOpen] = useState(false);

  async function signOut() {
    try {
      await api.post<void>("/auth/logout");
    } catch {
      // Logout is idempotent server-side; a failure here must not trap anyone
      // on a page they are trying to leave.
    }
    router.push("/login");
    router.refresh();
  }

  function toggle() {
    writeCollapsed(!collapsed);
  }

  const initial = (userNickname?.[0] ?? userEmail[0] ?? "?").toUpperCase();

  return (
    <aside
      data-collapsed={collapsed ? "true" : undefined}
      className={`sticky top-0 z-30 flex h-dvh shrink-0 flex-col border-r border-line bg-band/60 transition-[width] duration-200 ${
        collapsed ? "w-[4.5rem]" : "w-64"
      }`}
    >
      {/* Brand */}
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-3">
        <Link
          href="/admin"
          className="flex min-w-0 items-center gap-2 font-semibold text-ink"
          title="Acadu Admin"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-on-primary">
            <GraduationCap className="size-5" aria-hidden="true" />
          </span>
          {!collapsed && (
            <span className="min-w-0 truncate">
              Acadu
              <span className="ml-1.5 rounded bg-primary-soft px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary-strong">
                Admin
              </span>
            </span>
          )}
        </Link>
      </div>

      {/* Navigation */}
      <nav aria-label="Admin sections" className="flex-1 overflow-y-auto px-2 py-3">
        {GROUPS.map((group) => (
          <div key={group.label} className="mb-3">
            {!collapsed && (
              <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                {group.label}
              </p>
            )}
            <ul className="flex flex-col gap-0.5">
              {group.items.map(({ href, label, icon: Icon }) => {
                const active = isActive(href);
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      aria-current={active ? "page" : undefined}
                      title={collapsed ? label : undefined}
                      className={`flex min-h-10 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium transition-colors ${
                        active
                          ? "bg-primary text-on-primary"
                          : "text-ink-muted hover:bg-line/60 hover:text-ink"
                      } ${collapsed ? "justify-center" : ""}`}
                    >
                      <Icon className="size-4 shrink-0" aria-hidden="true" />
                      {!collapsed && <span className="truncate">{label}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer: back to app, collapse, user */}
      <div className="shrink-0 border-t border-line p-2">
        <Link
          href="/feed"
          title={collapsed ? "Back to the learner app" : undefined}
          className={`mb-1 flex min-h-10 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium text-ink-muted transition-colors hover:bg-line/60 hover:text-ink ${
            collapsed ? "justify-center" : ""
          }`}
        >
          <ExternalLink className="size-4 shrink-0" aria-hidden="true" />
          {!collapsed && <span className="truncate">Learner app</span>}
        </Link>

        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={`mb-1 flex min-h-10 w-full items-center gap-2.5 rounded-md px-2.5 text-sm font-medium text-ink-muted transition-colors hover:bg-line/60 hover:text-ink ${
            collapsed ? "justify-center" : ""
          }`}
        >
          {collapsed ? (
            <PanelLeft className="size-4 shrink-0" aria-hidden="true" />
          ) : (
            <PanelLeftClose className="size-4 shrink-0" aria-hidden="true" />
          )}
          {!collapsed && <span className="truncate">Collapse</span>}
        </button>

        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            className={`flex min-h-12 w-full items-center gap-2.5 rounded-md px-2 text-left transition-colors hover:bg-line/60 ${
              collapsed ? "justify-center" : ""
            }`}
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-on-primary">
              {initial}
            </span>
            {!collapsed && (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">
                    {userNickname ?? userEmail}
                  </span>
                  <span className="block truncate text-xs text-ink-faint">
                    {userRole.replace(/_/g, " ")}
                  </span>
                </span>
                <ChevronsUpDown className="size-4 shrink-0 text-ink-faint" aria-hidden="true" />
              </>
            )}
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute bottom-full left-0 z-40 mb-1 w-full min-w-52 rounded-md border border-line bg-surface p-1 shadow-lg"
            >
              <p className="truncate px-2.5 py-2 text-xs text-ink-faint">{userEmail}</p>
              <Link
                href="/settings"
                role="menuitem"
                className="flex min-h-10 items-center gap-2.5 rounded-md px-2.5 text-sm text-ink-muted hover:bg-band hover:text-ink"
              >
                <Cog className="size-4" aria-hidden="true" />
                Account settings
              </Link>
              {/* A link would issue a GET; the logout route only accepts POST. */}
              <button
                type="button"
                role="menuitem"
                onClick={() => void signOut()}
                className="flex min-h-10 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-sm text-danger hover:bg-danger-soft"
              >
                <LogOut className="size-4" aria-hidden="true" />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
