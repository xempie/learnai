"use client";

import { useEffect, useState } from "react";
import { Ban, Mail, RotateCcw, Search, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api-client";
import { Avatar } from "@/components/avatar";
import { ConfirmDialog } from "./confirm-dialog";
import {
  CARD,
  Chip,
  EmptyState,
  ErrorBox,
  FIELD,
  ICON_BTN,
  ICON_BTN_DANGER,
  LABEL,
  PageHeader,
  PrivacyNote,
  SkeletonRows,
  TD,
  TH,
  errorMessage,
  formatDate,
  hueFor,
  num,
  useAsync,
} from "./admin-ui";

/* ============ API shapes ============ */

interface AdminUser {
  id: string;
  email: string;
  nickname: string;
  role: string;
  email_verified: boolean;
  is_suspended: boolean;
  registered_at: string;
  last_active_at: string | null;
  deleted_at: string | null;
  comment_count: number;
  organization: { id: string; name: string } | null;
}

interface OrganizationOption {
  id: string;
  name: string;
}

type StatusFilter = "" | "active" | "suspended" | "unverified" | "deleted";

function statusOf(user: AdminUser) {
  if (user.deleted_at) return { label: "Deleted", tone: "neutral" as const };
  if (user.is_suspended) return { label: "Suspended", tone: "danger" as const };
  if (!user.email_verified) return { label: "Unverified", tone: "streak" as const };
  return { label: "Active", tone: "success" as const };
}

export function UsersView() {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [orgId, setOrgId] = useState("");
  const [status, setStatus] = useState<StatusFilter>("");
  const [message, setMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingSuspend, setPendingSuspend] = useState<AdminUser | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const users = useAsync<{ data: AdminUser[] }>(`${debounced}|${orgId}|${status}`, () =>
    api.get<{ data: AdminUser[] }>("/admin/users", {
      q: debounced || undefined,
      org_id: orgId || undefined,
      status: status || undefined,
    }),
  );

  // The organisation analytics endpoint is the only aggregate list of orgs an
  // admin may read; it returns names even when the counts are suppressed.
  const orgs = useAsync<{ data: OrganizationOption[] }>("org-options", () =>
    api.get<{ data: OrganizationOption[] }>("/admin/analytics/organizations"),
  );

  const rows = users.data?.data ?? [];

  async function mutate(user: AdminUser, work: () => Promise<string>) {
    setBusyId(user.id);
    setActionError("");
    setMessage("");
    try {
      setMessage(await work());
      users.reload();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  function setSuspended(user: AdminUser, suspend: boolean) {
    void mutate(user, async () => {
      await api.patch(`/admin/users/${user.id}`, {
        action: suspend ? "suspend" : "unsuspend",
      });
      return suspend
        ? `${user.nickname} suspended. Logged to the audit trail.`
        : `${user.nickname} unsuspended. Logged to the audit trail.`;
    });
  }

  function resendVerification(user: AdminUser) {
    void mutate(user, async () => {
      await api.patch(`/admin/users/${user.id}`, { action: "resend_verification" });
      return `Verification email resent to ${user.email}.`;
    });
  }

  function confirmSuspend() {
    const target = pendingSuspend;
    setPendingSuspend(null);
    if (target) setSuspended(target, true);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Users"
        description="Account administration only - verification, suspension and the aggregate counts needed to support people."
      />

      {/* ===== Filters ===== */}
      <div className={`${CARD} flex flex-wrap items-end gap-4 p-4`}>
        <div className="min-w-60 flex-1">
          <label htmlFor="user-search" className={LABEL}>
            Search
          </label>
          <div className="relative mt-1.5">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint"
              aria-hidden="true"
            />
            <input
              id="user-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Email or nickname"
              className={`${FIELD} pl-9`}
            />
          </div>
        </div>
        <div className="min-w-52">
          <label htmlFor="user-org" className={LABEL}>
            Organisation
          </label>
          <select
            id="user-org"
            value={orgId}
            onChange={(e) => setOrgId(e.target.value)}
            className={`${FIELD} mt-1.5`}
          >
            <option value="">All organisations</option>
            {(orgs.data?.data ?? []).map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-40">
          <label htmlFor="user-status" className={LABEL}>
            Status
          </label>
          <select
            id="user-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
            className={`${FIELD} mt-1.5`}
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="unverified">Unverified</option>
            <option value="deleted">Deleted</option>
          </select>
        </div>
      </div>

      <p role="status" aria-live="polite" className="min-h-6 text-sm font-semibold text-success">
        {message}
      </p>

      {actionError && <ErrorBox message={actionError} />}

      {/* ===== Table ===== */}
      {users.error ? (
        <ErrorBox message={users.error} onRetry={users.reload} />
      ) : users.loading ? (
        <div className={`${CARD} p-4`}>
          <SkeletonRows rows={6} />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState title="No users match those filters." hint="Try clearing the search box." />
      ) : (
        <div className={`${CARD} overflow-x-auto`}>
          <table className="w-full min-w-280 border-collapse text-sm">
            <caption className="sr-only">{rows.length} registered users</caption>
            <thead>
              <tr>
                <th scope="col" className={TH}>
                  User
                </th>
                <th scope="col" className={TH}>
                  Email
                </th>
                <th scope="col" className={TH}>
                  Organisation
                </th>
                <th scope="col" className={TH}>
                  Role
                </th>
                <th scope="col" className={TH}>
                  Registered
                </th>
                <th scope="col" className={TH}>
                  Last active
                </th>
                <th scope="col" className={`${TH} text-right`}>
                  Comments
                </th>
                <th scope="col" className={TH}>
                  Status
                </th>
                <th scope="col" className={`${TH} text-right`}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((user) => {
                const badge = statusOf(user);
                const busy = busyId === user.id;
                return (
                  <tr key={user.id}>
                    <td className={TD}>
                      <span className="flex items-center gap-3">
                        <Avatar name={user.nickname} hue={hueFor(user.nickname)} size="sm" />
                        <span className="font-medium">{user.nickname}</span>
                      </span>
                    </td>
                    <td className={`${TD} text-ink-muted`}>{user.email}</td>
                    <td className={`${TD} text-ink-muted`}>
                      {user.organization?.name ?? (
                        <span className="text-ink-faint">Solo learner</span>
                      )}
                    </td>
                    <td className={`${TD} whitespace-nowrap text-ink-muted`}>
                      {user.role.replace(/_/g, " ")}
                    </td>
                    <td className={`${TD} whitespace-nowrap text-ink-muted`}>
                      {formatDate(user.registered_at)}
                    </td>
                    <td className={`${TD} whitespace-nowrap text-ink-muted`}>
                      {formatDate(user.last_active_at)}
                    </td>
                    <td className={`${TD} text-right tabular-nums`}>{num(user.comment_count)}</td>
                    <td className={TD}>
                      <Chip tone={badge.tone}>{badge.label}</Chip>
                    </td>
                    <td className={TD}>
                      <div className="flex justify-end gap-1.5">
                        {!user.email_verified && (
                          <button
                            type="button"
                            aria-label={`Resend verification email to ${user.nickname}`}
                            title="Resend verification email"
                            disabled={busy}
                            onClick={() => resendVerification(user)}
                            className={ICON_BTN}
                          >
                            <Mail className="size-4" aria-hidden="true" />
                          </button>
                        )}
                        {user.is_suspended ? (
                          <button
                            type="button"
                            aria-label={`Unsuspend ${user.nickname}`}
                            title="Unsuspend"
                            disabled={busy}
                            onClick={() => setSuspended(user, false)}
                            className={ICON_BTN}
                          >
                            <RotateCcw className="size-4" aria-hidden="true" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            aria-label={`Suspend ${user.nickname}`}
                            title="Suspend"
                            disabled={busy}
                            onClick={() => setPendingSuspend(user)}
                            className={ICON_BTN_DANGER}
                          >
                            <Ban className="size-4" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <section aria-labelledby="privacy-heading" className={`${CARD} p-5`}>
        <h2 id="privacy-heading" className="flex items-center gap-2 font-semibold">
          <ShieldCheck className="size-5 text-primary-strong" aria-hidden="true" />
          What admins can and cannot see
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          Individual viewing history is deliberately not available. Admins can see that an account
          exists, when it was last active and how many comments it has left - never which topics
          or episodes a specific person opened. The API has no endpoint for it.
        </p>
        <PrivacyNote>
          Analytics answers &ldquo;how is this content performing&rdquo;, not &ldquo;what did this
          person watch&rdquo;. That capability was intentionally not built.
        </PrivacyNote>
      </section>

      <ConfirmDialog
        open={pendingSuspend !== null}
        title="Suspend this account?"
        description={
          <>
            <strong className="text-ink">{pendingSuspend?.nickname}</strong> keeps read access but
            cannot comment, like or report until the suspension is lifted. They are not notified
            automatically, and the action is written to the audit log.
          </>
        }
        confirmLabel="Suspend account"
        destructive
        onConfirm={confirmSuspend}
        onCancel={() => setPendingSuspend(null)}
      />
    </div>
  );
}
