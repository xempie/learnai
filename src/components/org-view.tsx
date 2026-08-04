"use client";

import { useCallback, useState } from "react";
import {
  AlertCircle,
  Award,
  Check,
  Copy,
  EyeOff,
  GraduationCap,
  KeyRound,
  Loader2,
  Trophy,
  Users,
} from "lucide-react";
import { Avatar } from "@/components/avatar";
import { avatarHue } from "@/components/app-shell";
import { errorMessage, useApiResource } from "@/components/notifications-view";
import { ApiClientError, api } from "@/lib/api-client";

/* ============================================================
   API shapes (snake_case, straight off the route handlers)
   ============================================================ */

interface Organisation {
  id: string;
  name: string;
  type: string;
  is_provisional?: boolean;
  /** Null whenever `suppressed` is true - there is no number to show. */
  member_count: number | null;
  suppressed: boolean;
  is_visible: boolean;
  is_founding_member: boolean;
}

interface OrgResponse {
  organization: Organisation | null;
}

interface OrgMember {
  id: string;
  nickname: string;
  avatar_key: string | null;
  is_founding_member: boolean;
}

interface MembersResponse {
  data: OrgMember[];
  next_cursor: string | null;
  member_count: number | null;
  suppressed: boolean;
}

interface VisibilityResponse {
  is_visible: boolean;
  member_count: number | null;
  suppressed: boolean;
}

interface JoinCode {
  id: string;
  org_id: string;
  code: string;
  label: string | null;
  max_uses: number | null;
  used_count: number;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
}

interface JoinCodesResponse {
  data: JoinCode[];
  next_cursor: string | null;
}

/** Aggregate headcount line. Never renders a number while suppressed. */
function headcount(org: Organisation): string {
  if (org.suppressed || org.member_count === null) {
    return "Be one of the first from your organisation";
  }
  return `${org.member_count} ${org.member_count === 1 ? "person" : "people"} learning here`;
}

export function OrgView() {
  const [visibilityBusy, setVisibilityBusy] = useState(false);
  const [visibilityError, setVisibilityError] = useState<string | null>(null);

  const fetchOrg = useCallback(
    async () => (await api.get<OrgResponse>("/org")).organization,
    [],
  );
  const {
    data: org,
    loading,
    error,
    reload: reloadOrg,
    setData: setOrg,
  } = useApiResource<Organisation | null>(fetchOrg, "We could not load your cohort.");

  const fetchMembers = useCallback(async () => {
    try {
      const res = await api.get<MembersResponse>("/org/members", { limit: 50 });
      return res.data;
    } catch (err) {
      // Not being in an organisation is a state, not a failure - the header
      // already says so, so the member panel just shows the empty case.
      if (err instanceof ApiClientError && err.status === 403) return [];
      throw err;
    }
  }, []);
  const {
    data: members,
    loading: membersLoading,
    error: membersError,
    reload: reloadMembers,
  } = useApiResource<OrgMember[]>(fetchMembers, "We could not load the member list.");

  async function toggleVisibility() {
    if (!org || visibilityBusy) return;
    const next = !org.is_visible;
    const previous = org;

    // Optimistic - a privacy switch that lags feels broken.
    setOrg({ ...org, is_visible: next });
    setVisibilityBusy(true);
    setVisibilityError(null);

    try {
      const res = await api.post<VisibilityResponse>("/org/visibility", { visible: next });
      setOrg((current) =>
        current
          ? {
              ...current,
              is_visible: res.is_visible,
              member_count: res.member_count,
              suppressed: res.suppressed,
            }
          : current,
      );
      reloadMembers();
    } catch (err) {
      setOrg(previous);
      setVisibilityError(errorMessage(err, "We could not change your visibility."));
    } finally {
      setVisibilityBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-6" aria-busy="true">
        <div className="rounded-card border border-line bg-surface p-6 shadow-xs">
          <div aria-hidden="true" className="flex items-start gap-4">
            <span className="size-12 shrink-0 animate-pulse rounded-md bg-band" />
            <span className="min-w-0 flex-1">
              <span className="block h-7 w-56 animate-pulse rounded bg-band" />
              <span className="mt-3 block h-4 w-40 animate-pulse rounded bg-band" />
            </span>
          </div>
        </div>
        <p className="sr-only">Loading your cohort</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-card border border-line bg-surface p-10 text-center shadow-xs">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-danger-soft">
          <AlertCircle className="size-6 text-danger" aria-hidden="true" />
        </span>
        <h1 className="mt-4 font-display text-lg font-semibold">We could not load your cohort</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-ink-muted">{error}</p>
        <button
          type="button"
          onClick={reloadOrg}
          className="mt-5 inline-flex min-h-12 items-center rounded-md bg-primary px-6 font-semibold text-on-primary transition-colors hover:bg-primary-strong"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ===== Org header ===== */}
      <header className="rounded-card border border-line bg-surface p-6 shadow-xs">
        <div className="flex items-start gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-primary-soft">
            <GraduationCap className="size-6 text-primary-strong" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold sm:text-3xl">
              {org ? org.name : "You are not in a cohort yet"}
            </h1>
            {org ? (
              <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-ink-muted">
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <Users className="size-4" aria-hidden="true" />
                  {headcount(org)}
                </span>
                {org.is_founding_member && (
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-streak-soft px-2.5 py-0.5 text-sm font-semibold text-streak">
                    <Award className="size-4" aria-hidden="true" />
                    Founding member
                  </span>
                )}
              </p>
            ) : (
              <p className="mt-2 text-ink-muted">
                Sign up with your organisation email, or redeem a join code below, and your
                colleagues&rsquo; cohort appears here.
              </p>
            )}
          </div>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          {/* ===== Members ===== */}
          <section
            aria-labelledby="members-heading"
            aria-busy={membersLoading}
            className="rounded-card border border-line bg-surface p-5 shadow-xs"
          >
            <h2 id="members-heading" className="text-lg font-semibold">
              Who&rsquo;s here
            </h2>

            {membersLoading ? (
              <ul aria-hidden="true" className="mt-4 flex flex-col gap-3">
                {[0, 1, 2].map((i) => (
                  <li key={i} className="flex items-center gap-3">
                    <span className="size-10 shrink-0 animate-pulse rounded-full bg-band" />
                    <span className="h-4 w-32 animate-pulse rounded bg-band" />
                  </li>
                ))}
              </ul>
            ) : membersError ? (
              <div className="mt-4 rounded-md bg-danger-soft px-3 py-2.5 text-sm">
                <p role="alert" className="flex items-start gap-2 font-medium text-ink">
                  <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
                  {membersError}
                </p>
                <button
                  type="button"
                  onClick={reloadMembers}
                  className="mt-2 inline-flex min-h-9 items-center rounded-md border border-line bg-surface px-3 text-sm font-semibold text-ink transition-colors hover:border-primary hover:text-primary-strong"
                >
                  Try again
                </button>
              </div>
            ) : !members || members.length === 0 ? (
              <p className="mt-4 rounded-md bg-band px-4 py-6 text-center text-sm leading-relaxed text-ink-muted">
                Nobody here has opted in to being listed yet. Turn on your own visibility to be
                the first - your nickname is all anybody sees.
              </p>
            ) : (
              <ul className="mt-4 flex flex-col gap-2">
                {members.map((member) => (
                  <li
                    key={member.id}
                    className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-band"
                  >
                    <Avatar name={member.nickname} hue={avatarHue(member.avatar_key)} />
                    <span className="min-w-0 flex-1 truncate font-semibold">
                      {member.nickname}
                    </span>
                    {member.is_founding_member && (
                      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-streak-soft px-2.5 py-0.5 text-xs font-semibold text-streak">
                        <Award className="size-3.5" aria-hidden="true" />
                        Founding
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-faint">
              <EyeOff className="size-3.5 shrink-0" aria-hidden="true" />
              Only members who chose to be visible appear here.
            </p>
          </section>

          {/* ===== Leaderboard: not built yet, so say so ===== */}
          <section
            aria-labelledby="board-heading"
            className="rounded-card border border-line bg-surface p-5 shadow-xs"
          >
            <h2 id="board-heading" className="flex items-center gap-2 text-lg font-semibold">
              <Trophy className="size-5 text-primary-strong" aria-hidden="true" />
              Leaderboard
            </h2>
            <p className="mt-2 rounded-md bg-band px-4 py-6 text-center text-sm leading-relaxed text-ink-muted">
              Cohort leaderboards are not switched on yet. We are building the points and streak
              scoring behind them first, so nothing here would be real. This panel will fill in
              once it ships.
            </p>
          </section>
        </div>

        <div className="flex flex-col gap-6">
          {/* ===== Visibility opt-in (privacy-critical, default OFF) ===== */}
          {org && (
            <section
              aria-labelledby="visibility-heading"
              className="rounded-card border border-line bg-surface p-5 shadow-xs"
            >
              <h2 id="visibility-heading" className="flex items-center gap-2 font-semibold">
                <Users className="size-5 text-primary-strong" aria-hidden="true" />
                Your visibility
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                {org.is_visible
                  ? "Your nickname appears in this member list. You can switch this off at any time - the change is immediate."
                  : "You're currently private. Nobody at your organisation can see you're learning here - not even that you have an account."}
              </p>
              <div className="mt-4 flex items-center justify-between gap-3">
                <label htmlFor="org-visible" className="font-semibold">
                  Appear in the member list
                </label>
                <button
                  id="org-visible"
                  type="button"
                  role="switch"
                  aria-checked={org.is_visible}
                  disabled={visibilityBusy}
                  onClick={() => void toggleVisibility()}
                  className={`relative h-8 w-14 shrink-0 rounded-full transition-colors disabled:opacity-60 ${
                    org.is_visible ? "bg-primary" : "bg-line-strong"
                  }`}
                >
                  <span className="sr-only">Appear in the member list</span>
                  <span
                    aria-hidden="true"
                    className={`absolute top-1 size-6 rounded-full bg-white shadow-sm transition-transform ${
                      org.is_visible ? "translate-x-7" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
              {visibilityError && (
                <p
                  role="alert"
                  className="mt-3 flex items-start gap-2 rounded-md bg-danger-soft px-3 py-2 text-xs font-medium text-ink"
                >
                  <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-danger" aria-hidden="true" />
                  {visibilityError}
                </p>
              )}
              {!org.is_visible && (
                <p className="mt-3 rounded-md bg-band px-3 py-2 text-xs text-ink-faint">
                  Off by default. Turning this on shows your nickname - never your real name or
                  email.
                </p>
              )}
            </section>
          )}

          <JoinCodePanel
            onJoined={() => {
              reloadOrg();
              reloadMembers();
            }}
          />

          <AdminJoinCodes />
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Redeem a join code - available to everyone
   ============================================================ */

function JoinCodePanel({ onJoined }: { onJoined: () => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || code.trim().length === 0) return;

    setBusy(true);
    setSuccess(null);
    setFailure(null);
    try {
      const res = await api.post<OrgResponse>("/org/join", { code: code.trim() });
      setCode("");
      setSuccess(
        res.organization
          ? `You have joined ${res.organization.name}.`
          : "Join code accepted.",
      );
      onJoined();
    } catch (err) {
      setFailure(errorMessage(err, "That code could not be redeemed. Check it and try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="join-heading"
      className="rounded-card border border-line bg-surface p-5 shadow-xs"
    >
      <h2 id="join-heading" className="flex items-center gap-2 font-semibold">
        <KeyRound className="size-5 text-primary-strong" aria-hidden="true" />
        Have a join code?
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-muted">
        Codes are handed out by an organisation. Redeeming one puts you in that cohort - it does
        not make you visible to anyone.
      </p>

      <form onSubmit={submit} className="mt-3 flex items-stretch gap-2">
        <input
          id="join-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          aria-label="Organisation join code"
          autoComplete="off"
          spellCheck={false}
          placeholder="e.g. ADEL-4K2P"
          className="h-12 min-w-0 flex-1 rounded-field border border-line bg-surface px-3 text-sm font-semibold uppercase tracking-wide text-ink placeholder:font-medium placeholder:normal-case placeholder:tracking-normal placeholder:text-ink-faint focus:border-primary"
        />
        <button
          type="submit"
          disabled={busy || code.trim().length === 0}
          className="inline-flex min-h-12 shrink-0 items-center gap-1.5 rounded-field bg-primary px-4 font-semibold text-on-primary transition-colors hover:bg-primary-strong disabled:cursor-not-allowed disabled:bg-line-strong"
        >
          {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          {busy ? "Joining…" : "Join"}
        </button>
      </form>

      <p aria-live="polite" className="mt-2 text-sm font-semibold text-success">
        {success ?? ""}
      </p>
      {failure && (
        <p
          role="alert"
          className="mt-2 flex items-start gap-2 rounded-md bg-danger-soft px-3 py-2 text-sm font-medium text-ink"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
          {failure}
        </p>
      )}
    </section>
  );
}

/* ============================================================
   Issued join codes - admin only, hidden entirely on a 403
   ============================================================ */

function AdminJoinCodes() {
  const [copied, setCopied] = useState<string | null>(null);

  // Resolving to null (rather than throwing) is how "not for you" travels:
  // a 403 hides the panel, it does not colour the page with an error.
  const fetchCodes = useCallback(async (): Promise<JoinCode[] | null> => {
    try {
      const res = await api.get<JoinCodesResponse>("/org/codes", { limit: 20 });
      return res.data;
    } catch (err) {
      if (err instanceof ApiClientError && (err.status === 403 || err.status === 401)) {
        return null;
      }
      throw err;
    }
  }, []);
  const {
    data: codes,
    loading,
    error,
    reload,
  } = useApiResource<JoinCode[] | null>(fetchCodes, "We could not load the join codes.");

  const allowed = codes !== null || error !== null;

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(code);
      setTimeout(() => setCopied(null), 2500);
    } catch {
      /* clipboard unavailable - the code is still selectable */
    }
  }

  if (!allowed || loading) return null;

  return (
    <section
      aria-labelledby="codes-heading"
      className="rounded-card border border-line bg-surface p-5 shadow-xs"
    >
      <h2 id="codes-heading" className="flex items-center gap-2 font-semibold">
        <KeyRound className="size-5 text-primary-strong" aria-hidden="true" />
        Issued join codes
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-muted">
        Visible to platform administrators only. Share a code with the people who should land in
        that cohort.
      </p>

      {error ? (
        <div className="mt-3 rounded-md bg-danger-soft px-3 py-2.5 text-sm">
          <p role="alert" className="flex items-start gap-2 font-medium text-ink">
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
            {error}
          </p>
          <button
            type="button"
            onClick={reload}
            className="mt-2 inline-flex min-h-9 items-center rounded-md border border-line bg-surface px-3 text-sm font-semibold text-ink transition-colors hover:border-primary hover:text-primary-strong"
          >
            Try again
          </button>
        </div>
      ) : !codes || codes.length === 0 ? (
        <p className="mt-3 rounded-md bg-band px-3 py-3 text-sm text-ink-muted">
          No join codes have been created yet.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {codes.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between gap-2 rounded-md border border-line px-3 py-2"
            >
              <span className="min-w-0">
                <span className="block truncate font-mono text-sm font-semibold text-ink">
                  {c.code}
                </span>
                <span className="block truncate text-xs text-ink-faint">
                  {c.label ? `${c.label} · ` : ""}
                  {c.used_count}
                  {c.max_uses === null ? " used" : ` of ${c.max_uses} used`}
                  {c.is_active ? "" : " · inactive"}
                </span>
              </span>
              <button
                type="button"
                onClick={() => void copy(c.code)}
                aria-label={`Copy join code ${c.code}`}
                className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-sm font-semibold transition-colors ${
                  copied === c.code
                    ? "bg-success-soft text-success"
                    : "text-primary-strong hover:bg-primary-soft"
                }`}
              >
                {copied === c.code ? (
                  <>
                    <Check className="size-4" aria-hidden="true" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="size-4" aria-hidden="true" />
                    Copy
                  </>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p aria-live="polite" className="sr-only">
        {copied ? "Join code copied to clipboard" : ""}
      </p>
    </section>
  );
}
