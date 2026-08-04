"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  BadgeCheck,
  CreditCard,
  Download,
  Loader2,
  LogOut,
  Sparkles,
  Trash2,
  UserRound,
} from "lucide-react";
import { Avatar } from "@/components/avatar";
import { type Me, useCurrentUser } from "@/components/app-shell";
import { errorMessage, useApiResource } from "@/components/notifications-view";
import { ApiClientError, api } from "@/lib/api-client";
import { AVATAR_PRESETS } from "@/lib/constants";
import { AGE_RANGES } from "@/lib/constants";

const PERSONAS: { value: string; label: string }[] = [
  { value: "", label: "Prefer not to say" },
  { value: "student", label: "Student" },
  { value: "academic", label: "Academic" },
  { value: "professional", label: "Professional" },
  { value: "manager", label: "Manager" },
  { value: "elderly", label: "Lifelong learner" },
  { value: "other", label: "Other" },
];

const LEVELS: { value: string; label: string; hint: string }[] = [
  { value: "basic", label: "Basic", hint: "New to AI" },
  { value: "intermediate", label: "Intermediate", hint: "Use it sometimes" },
  { value: "advanced", label: "Advanced", hint: "Daily user" },
];

/** Suggestions only - the server validates against the full IANA database. */
const TIMEZONE_SUGGESTIONS = [
  "Australia/Adelaide",
  "Australia/Brisbane",
  "Australia/Darwin",
  "Australia/Melbourne",
  "Australia/Perth",
  "Australia/Sydney",
  "Pacific/Auckland",
  "Asia/Singapore",
  "Europe/London",
  "America/New_York",
  "UTC",
];

// SERVICES_ACTION_PLAN §1: billing UI is dead weight while the platform is
// free for everyone - keep the component mounted-capable, just don't render it.
const billingEnabled = process.env.NEXT_PUBLIC_FREE_PLATFORM !== "true";

export function SettingsView() {
  const { user, loading, error, reload, setUser } = useCurrentUser();

  if (loading) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-6" aria-busy="true">
        <p className="sr-only">Loading your settings</p>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            aria-hidden="true"
            className="rounded-card border border-line bg-surface p-5 shadow-xs sm:p-6"
          >
            <span className="block h-6 w-40 animate-pulse rounded bg-band" />
            <span className="mt-5 block h-12 w-full animate-pulse rounded-field bg-band" />
            <span className="mt-3 block h-12 w-2/3 animate-pulse rounded-field bg-band" />
          </div>
        ))}
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="mx-auto max-w-3xl rounded-card border border-line bg-surface p-10 text-center shadow-xs">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-danger-soft">
          <AlertCircle className="size-6 text-danger" aria-hidden="true" />
        </span>
        <h1 className="mt-4 font-display text-lg font-semibold">We could not load your settings</h1>
        <p role="alert" className="mx-auto mt-2 max-w-md text-sm text-ink-muted">
          {error ?? "Your profile is unavailable right now."}
        </p>
        <button
          type="button"
          onClick={reload}
          className="mt-5 inline-flex min-h-12 items-center rounded-md bg-primary px-6 font-semibold text-on-primary transition-colors hover:bg-primary-strong"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold sm:text-3xl">Settings</h1>
      </header>

      <ProfileSection user={user} onSaved={setUser} />
      {billingEnabled && <SubscriptionSection />}
      <AccountSection />
    </div>
  );
}

/* ============================================================
   Profile
   ============================================================ */

function ProfileSection({ user, onSaved }: { user: Me; onSaved: (u: Me) => void }) {
  const [nickname, setNickname] = useState(user.nickname);
  const [avatarKey, setAvatarKey] = useState<string>(
    user.avatar_key ?? AVATAR_PRESETS[0].id,
  );
  const [ageRange, setAgeRange] = useState<string>(user.age_range ?? "");
  const [timezone, setTimezone] = useState(user.timezone);
  const [persona, setPersona] = useState<string>(user.persona ?? "");
  const [level, setLevel] = useState<string>(user.skill_level);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function save() {
    if (saving) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    setFieldErrors({});
    try {
      const updated = await api.patch<Me>("/me", {
        nickname,
        avatarKey,
        ...(ageRange ? { ageRange } : {}),
        timezone,
        persona: persona === "" ? null : persona,
        skillLevel: level,
      });
      onSaved(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
        setFieldErrors(err.fieldErrors ?? {});
      } else {
        setError("We could not save your changes. Check your connection and try again.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      aria-labelledby="profile-heading"
      className="rounded-card border border-line bg-surface p-5 shadow-xs sm:p-6"
    >
      <h2 id="profile-heading" className="flex items-center gap-2 text-lg font-semibold">
        <UserRound className="size-5 text-primary-strong" aria-hidden="true" />
        Profile
      </h2>

      {error && (
        <p
          role="alert"
          className="mt-4 flex items-start gap-2 rounded-md bg-danger-soft px-3 py-2.5 text-sm font-medium text-ink"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
          {error}
        </p>
      )}

      <div className="mt-5 flex flex-col gap-5">
        <div>
          <label htmlFor="nickname" className="block font-semibold">
            Nickname
          </label>
          <p className="mt-0.5 text-sm text-ink-faint">
            This is your public identity - your real name is never shown.
          </p>
          <input
            id="nickname"
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            autoComplete="nickname"
            aria-invalid={fieldErrors.nickname ? true : undefined}
            aria-describedby={fieldErrors.nickname ? "nickname-error" : undefined}
            className="mt-2 h-12 w-full max-w-sm rounded-field border border-line bg-surface px-4 font-medium focus:border-primary"
          />
          {fieldErrors.nickname && (
            <p id="nickname-error" role="alert" className="mt-1.5 text-sm text-danger">
              {fieldErrors.nickname}
            </p>
          )}
        </div>

        <fieldset>
          <legend className="font-semibold">Avatar</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {AVATAR_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => setAvatarKey(preset.id)}
                aria-pressed={avatarKey === preset.id}
                aria-label={`Avatar colour ${preset.label}`}
                className={`rounded-full p-0.5 transition-shadow ${
                  avatarKey === preset.id ? "ring-3 ring-line ring-offset-2" : ""
                }`}
              >
                <Avatar name={nickname || "?"} hue={preset.hue} size="lg" />
              </button>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="persona" className="block font-semibold">
              I&rsquo;m learning as a…
            </label>
            <select
              id="persona"
              value={persona}
              onChange={(e) => setPersona(e.target.value)}
              className="mt-2 h-12 w-full rounded-field border border-line bg-surface px-3 font-medium focus:border-primary"
            >
              {PERSONAS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <fieldset>
            <legend className="font-semibold">Skill level</legend>
            <div className="mt-2 flex gap-2">
              {LEVELS.map((l) => (
                <button
                  key={l.value}
                  type="button"
                  onClick={() => setLevel(l.value)}
                  aria-pressed={level === l.value}
                  title={l.hint}
                  className={`min-h-12 flex-1 rounded-field border-2 px-2 text-sm font-semibold transition-colors ${
                    level === l.value
                      ? "border-primary bg-primary-soft text-primary-strong"
                      : "border-line text-ink-muted hover:border-line-strong"
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </fieldset>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="age-range" className="block font-semibold">
              Age range
            </label>
            <select
              id="age-range"
              value={ageRange}
              onChange={(e) => setAgeRange(e.target.value)}
              aria-invalid={fieldErrors.ageRange ? true : undefined}
              aria-describedby={fieldErrors.ageRange ? "age-error" : undefined}
              className="mt-2 h-12 w-full rounded-field border border-line bg-surface px-3 font-medium focus:border-primary"
            >
              <option value="">Select your age range…</option>
              {AGE_RANGES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            {fieldErrors.ageRange && (
              <p id="age-error" role="alert" className="mt-1.5 text-sm text-danger">
                {fieldErrors.ageRange}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="timezone" className="block font-semibold">
              Time zone
            </label>
            <input
              id="timezone"
              list="timezone-options"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              spellCheck={false}
              aria-invalid={fieldErrors.timezone ? true : undefined}
              aria-describedby={fieldErrors.timezone ? "timezone-error" : "timezone-hint"}
              className="mt-2 h-12 w-full rounded-field border border-line bg-surface px-3 font-medium focus:border-primary"
            />
            <datalist id="timezone-options">
              {TIMEZONE_SUGGESTIONS.map((tz) => (
                <option key={tz} value={tz} />
              ))}
            </datalist>
            {fieldErrors.timezone ? (
              <p id="timezone-error" role="alert" className="mt-1.5 text-sm text-danger">
                {fieldErrors.timezone}
              </p>
            ) : (
              <p id="timezone-hint" className="mt-1.5 text-sm text-ink-faint">
                Used for streak day boundaries. For example, Australia/Sydney.
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="inline-flex min-h-12 items-center gap-2 rounded-md bg-primary px-6 font-semibold text-on-primary transition-colors hover:bg-primary-strong disabled:opacity-60"
          >
            {saving && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {saving ? "Saving…" : "Save changes"}
          </button>
          <span aria-live="polite" className="text-sm font-semibold text-success">
            {saved ? "Saved!" : ""}
          </span>
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   Subscription
   ============================================================ */

interface SubscriptionRow {
  id: string;
  status: string;
  plan: string;
  trial_ends_at: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  created_at: string;
}

interface SubscriptionResponse {
  subscription: SubscriptionRow | null;
  entitlements: {
    tier: string;
    reason: string;
    trial_ends_at: string | null;
  };
  billing_enabled: boolean;
}

interface CouponResult {
  valid: boolean;
  discount_type: string | null;
  discount_value: number | null;
  description: string | null;
  message: string;
}

function formatDate(iso: string | null): string {
  if (!iso) return "unknown";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unknown";
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
}

function SubscriptionSection() {
  const [forcedNotConfigured, setForcedNotConfigured] = useState(false);
  const [coupon, setCoupon] = useState("");
  const [couponResult, setCouponResult] = useState<CouponResult | null>(null);
  const [checkingCoupon, setCheckingCoupon] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  // Stripe being absent is an environment fact, not an error to shout about:
  // a 501 resolves to null, which the panel renders as "not configured".
  const fetchSubscription = useCallback(async (): Promise<SubscriptionResponse | null> => {
    try {
      return await api.get<SubscriptionResponse>("/billing/subscription");
    } catch (err) {
      if (err instanceof ApiClientError && (err.code === "NOT_CONFIGURED" || err.status === 501)) {
        return null;
      }
      throw err;
    }
  }, []);
  const {
    data,
    loading,
    error,
    reload,
  } = useApiResource<SubscriptionResponse | null>(
    fetchSubscription,
    "We could not load your subscription.",
  );

  async function checkCoupon() {
    if (!coupon.trim() || checkingCoupon) return;
    setCheckingCoupon(true);
    setCheckoutError(null);
    try {
      setCouponResult(
        await api.post<CouponResult>("/billing/coupon/validate", { code: coupon.trim() }),
      );
    } catch (err) {
      setCouponResult(null);
      setCheckoutError(errorMessage(err, "We could not check that code."));
    } finally {
      setCheckingCoupon(false);
    }
  }

  async function startCheckout() {
    if (checkoutBusy) return;
    setCheckoutBusy(true);
    setCheckoutError(null);
    try {
      // A code the user typed is validated first so an invalid one is a form
      // message rather than a bounce off Stripe.
      if (coupon.trim()) {
        const result = await api.post<CouponResult>("/billing/coupon/validate", {
          code: coupon.trim(),
        });
        setCouponResult(result);
        if (!result.valid) {
          setCheckoutBusy(false);
          return;
        }
      }
      const res = await api.post<{ url: string }>("/billing/checkout", {
        ...(coupon.trim() ? { couponCode: coupon.trim() } : {}),
      });
      window.location.assign(res.url);
    } catch (err) {
      if (err instanceof ApiClientError && (err.code === "NOT_CONFIGURED" || err.status === 501)) {
        setForcedNotConfigured(true);
      } else {
        setCheckoutError(errorMessage(err, "We could not start checkout. Try again shortly."));
      }
      setCheckoutBusy(false);
    }
  }

  const billingOff =
    forcedNotConfigured || data === null || !data.billing_enabled;

  return (
    <section
      id="subscription"
      aria-labelledby="sub-heading"
      aria-busy={loading}
      className="scroll-mt-20 rounded-card border border-line bg-surface p-5 shadow-xs sm:p-6"
    >
      <h2 id="sub-heading" className="flex items-center gap-2 text-lg font-semibold">
        <CreditCard className="size-5 text-primary-strong" aria-hidden="true" />
        Subscription
      </h2>

      {loading ? (
        <div aria-hidden="true" className="mt-4 h-24 animate-pulse rounded-md bg-band" />
      ) : error ? (
        <div className="mt-4 rounded-md bg-danger-soft px-3 py-3 text-sm">
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
      ) : billingOff ? (
        <div className="mt-4 rounded-md bg-band p-4">
          <p className="font-semibold">Billing is not configured on this environment</p>
          <p className="mt-1 text-sm text-ink-muted">
            {data
              ? `Your access is currently ${data.entitlements.tier} (${data.entitlements.reason.replace(/_/g, " ")}). Nothing to pay for here.`
              : "Nothing to pay for here."}
          </p>
        </div>
      ) : (
        <>
          <div className="mt-4 flex flex-col gap-4 rounded-md bg-band p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="flex items-center gap-2 font-semibold">
                <Sparkles className="size-4 text-primary-strong" aria-hidden="true" />
                {data?.subscription
                  ? `${data.subscription.plan} - ${data.subscription.status.replace(/_/g, " ")}`
                  : "Free trial"}
              </p>
              <p className="mt-1 text-sm text-ink-muted">
                {data?.subscription?.current_period_end
                  ? `Renews ${formatDate(data.subscription.current_period_end)}.`
                  : data?.entitlements.trial_ends_at
                    ? `Full access until ${formatDate(data.entitlements.trial_ends_at)}. No card on file.`
                    : "No card on file."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void startCheckout()}
              disabled={checkoutBusy}
              className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-md bg-primary px-6 font-semibold text-on-primary transition-colors hover:bg-primary-strong disabled:opacity-60"
            >
              {checkoutBusy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              {checkoutBusy ? "Opening checkout…" : "Upgrade - $9/month"}
            </button>
          </div>

          <div className="mt-4">
            <label htmlFor="coupon" className="block text-sm font-semibold">
              Coupon code (optional)
            </label>
            <div className="mt-2 flex items-stretch gap-2">
              <input
                id="coupon"
                value={coupon}
                onChange={(e) => {
                  setCoupon(e.target.value);
                  setCouponResult(null);
                }}
                autoComplete="off"
                spellCheck={false}
                placeholder="Enter a code"
                className="h-12 min-w-0 flex-1 rounded-field border border-line bg-surface px-3 font-medium placeholder:text-ink-faint focus:border-primary sm:max-w-xs"
              />
              <button
                type="button"
                onClick={() => void checkCoupon()}
                disabled={checkingCoupon || coupon.trim().length === 0}
                className="inline-flex min-h-12 shrink-0 items-center gap-2 rounded-md border border-line px-4 font-semibold text-ink transition-colors hover:border-primary hover:text-primary-strong disabled:cursor-not-allowed disabled:opacity-50"
              >
                {checkingCoupon && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                Apply
              </button>
            </div>
            {couponResult && (
              <p
                aria-live="polite"
                className={`mt-2 text-sm font-semibold ${
                  couponResult.valid ? "text-success" : "text-danger"
                }`}
              >
                {couponResult.message}
              </p>
            )}
          </div>

          {checkoutError && (
            <p
              role="alert"
              className="mt-3 flex items-start gap-2 rounded-md bg-danger-soft px-3 py-2.5 text-sm font-medium text-ink"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
              {checkoutError}
            </p>
          )}

          <ul className="mt-4 grid gap-2 text-sm text-ink-muted sm:grid-cols-2">
            {[
              "Unlimited videos & quizzes",
              "Certificates (coming soon)",
              "Cancel anytime",
            ].map((f) => (
              <li key={f} className="flex items-center gap-2">
                <BadgeCheck className="size-4 shrink-0 text-success" aria-hidden="true" />
                {f}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/* ============================================================
   Account & data rights
   ============================================================ */

function AccountSection() {
  const router = useRouter();
  const [exporting, setExporting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (confirmingDelete) confirmRef.current?.focus();
  }, [confirmingDelete]);

  async function exportData() {
    if (exporting) return;
    setExporting(true);
    setError(null);
    try {
      const archive = await api.get<Record<string, unknown>>("/me/export");
      const blob = new Blob([JSON.stringify(archive, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `acadu-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(errorMessage(err, "We could not build your export. Try again shortly."));
    } finally {
      setExporting(false);
    }
  }

  async function signOut() {
    setSigningOut(true);
    try {
      await api.post<void>("/auth/logout");
    } catch {
      // Idempotent server-side; never trap someone on this page.
    }
    router.push("/login");
    router.refresh();
  }

  async function deleteAccount() {
    if (deleting) return;
    setDeleting(true);
    setError(null);
    try {
      await api.delete<void>("/me");
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "We could not delete your account. Try again shortly."));
      setDeleting(false);
    }
  }

  return (
    <section
      aria-labelledby="account-heading"
      className="rounded-card border border-line bg-surface p-5 shadow-xs sm:p-6"
    >
      <h2 id="account-heading" className="text-lg font-semibold">
        Account &amp; data
      </h2>

      {error && (
        <p
          role="alert"
          className="mt-4 flex items-start gap-2 rounded-md bg-danger-soft px-3 py-2.5 text-sm font-medium text-ink"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-col gap-2">
        <button
          type="button"
          onClick={() => void exportData()}
          disabled={exporting}
          className="inline-flex min-h-12 items-center gap-2 rounded-md border border-line px-4 font-semibold text-ink transition-colors hover:border-primary hover:text-primary-strong disabled:opacity-60"
        >
          {exporting ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Download className="size-4" aria-hidden="true" />
          )}
          {exporting ? "Preparing your file…" : "Export my data (JSON)"}
        </button>

        <button
          type="button"
          onClick={() => void signOut()}
          disabled={signingOut}
          className="inline-flex min-h-12 items-center gap-2 rounded-md border border-line px-4 font-semibold text-ink transition-colors hover:border-primary hover:text-primary-strong disabled:opacity-60"
        >
          <LogOut className="size-4" aria-hidden="true" />
          {signingOut ? "Signing out…" : "Sign out"}
        </button>

        {confirmingDelete ? (
          <div
            ref={confirmRef}
            role="alertdialog"
            aria-labelledby="delete-title"
            aria-describedby="delete-body"
            tabIndex={-1}
            className="mt-2 rounded-md border border-danger/30 bg-danger-soft p-4"
          >
            <p id="delete-title" className="font-semibold text-danger">
              Delete your account?
            </p>
            <p id="delete-body" className="mt-1 text-sm leading-relaxed text-ink">
              This signs you out and anonymises everything that identifies you, immediately and
              permanently. It cannot be undone.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void deleteAccount()}
                disabled={deleting}
                className="inline-flex min-h-12 items-center gap-2 rounded-md bg-danger px-4 font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {deleting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                {deleting ? "Deleting…" : "Yes, delete my account"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                disabled={deleting}
                className="inline-flex min-h-12 items-center rounded-md border border-line bg-surface px-4 font-semibold text-ink transition-colors hover:border-primary hover:text-primary-strong disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="mt-2 inline-flex min-h-12 items-center gap-2 rounded-md border border-danger/30 px-4 font-semibold text-danger transition-colors hover:bg-danger-soft"
          >
            <Trash2 className="size-4" aria-hidden="true" />
            Delete my account
          </button>
        )}

        <p className="text-xs text-ink-faint">
          Deletion anonymises your data immediately and permanently removes it within 30 days.
        </p>
      </div>
    </section>
  );
}
