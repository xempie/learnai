"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Award,
  Check,
  Loader2,
  PartyPopper,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Avatar } from "@/components/avatar";
import { useApiResource } from "@/components/notifications-view";
import { ApiClientError, api } from "@/lib/api-client";
import { AVATAR_PRESETS } from "@/lib/constants";

/** V1_BUILD_SPEC §4.1 - avatar, exactly 3 categories, cohort reveal + opt-in. */
const STEPS = ["Your avatar", "Your interests", "Your cohort"] as const;

interface CategoryOption {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  color_hex: string;
  is_active: boolean;
}

interface Organisation {
  id: string;
  name: string;
  type: string;
  member_count: number | null;
  suppressed: boolean;
  is_visible: boolean;
  is_founding_member: boolean;
}

function message(err: unknown, fallback: string): string {
  return err instanceof ApiClientError ? err.message : fallback;
}

export function OnboardingFlow() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [avatarKey, setAvatarKey] = useState<string>(AVATAR_PRESETS[0].id);
  const [picked, setPicked] = useState<string[]>([]);
  const [done, setDone] = useState(false);

  /* ---------- categories ---------- */
  const fetchCategories = useCallback(
    async () =>
      (await api.get<{ data: CategoryOption[] }>("/categories")).data.filter((c) => c.is_active),
    [],
  );
  const {
    data: categoryData,
    loading: categoriesLoading,
    error: categoriesError,
    reload: reloadCategories,
  } = useApiResource<CategoryOption[]>(fetchCategories, "We could not load the topic list.");
  const categories = categoryData ?? [];

  /* ---------- cohort ---------- */
  const [visibilityBusy, setVisibilityBusy] = useState(false);
  const [visibilityError, setVisibilityError] = useState<string | null>(null);

  const fetchOrg = useCallback(
    async () => (await api.get<{ organization: Organisation | null }>("/org")).organization,
    [],
  );
  const {
    data: org,
    loading: orgLoading,
    error: orgError,
    reload: reloadOrg,
    setData: setOrg,
  } = useApiResource<Organisation | null>(fetchOrg, "We could not load your cohort details.");

  /* ---------- finish ---------- */
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const atLimit = picked.length >= 3;

  function toggleCategory(id: string) {
    setPicked((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : prev.length < 3 ? [...prev, id] : prev,
    );
  }

  async function toggleVisibility() {
    if (!org || visibilityBusy) return;
    const previous = org;
    setOrg({ ...org, is_visible: !org.is_visible });
    setVisibilityBusy(true);
    setVisibilityError(null);
    try {
      const res = await api.post<{
        is_visible: boolean;
        member_count: number | null;
        suppressed: boolean;
      }>("/org/visibility", { visible: !previous.is_visible });
      setOrg({
        ...previous,
        is_visible: res.is_visible,
        member_count: res.member_count,
        suppressed: res.suppressed,
      });
    } catch (err) {
      setOrg(previous);
      setVisibilityError(message(err, "We could not change your visibility."));
    } finally {
      setVisibilityBusy(false);
    }
  }

  const canNext =
    step === 0 || (step === 1 && picked.length === 3) || (step === 2 && !saving);

  async function next() {
    if (step < 2) {
      setStep(step + 1);
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await api.post<{ onboarded: boolean }>("/me/onboarding", {
        avatarKey,
        categoryIds: picked,
      });
      setDone(true);
      router.push("/feed");
      router.refresh();
    } catch (err) {
      setSaveError(message(err, "We could not save your choices. Try again in a moment."));
      setSaving(false);
    }
  }

  if (done) {
    return (
      <div className="text-center">
        <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-primary-soft">
          <PartyPopper className="size-8 text-primary-strong" aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-2xl font-semibold">You&rsquo;re all set</h1>
        <p className="mt-2 text-ink-muted">
          Your feed is built from the three topics you picked. You can change them any time.
        </p>
        <button
          type="button"
          onClick={() => router.push("/feed")}
          className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-md bg-primary px-8 font-semibold text-on-primary transition-colors hover:bg-primary-strong"
        >
          Go to my feed
          <ArrowRight className="size-4" aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Step indicator */}
      <nav aria-label="Onboarding progress">
        <p className="text-sm font-semibold text-ink-faint">
          Step {step + 1} of {STEPS.length} - {STEPS[step]}
        </p>
        <div className="mt-2 flex gap-1.5">
          {STEPS.map((s, i) => (
            <span
              key={s}
              className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-primary" : "bg-line"}`}
            />
          ))}
        </div>
      </nav>

      <div className="mt-6 min-h-80">
        {step === 0 && (
          <div>
            <h1 className="text-xl font-semibold sm:text-2xl">Pick your avatar</h1>
            <p className="mt-1 text-ink-muted">
              This is how you appear to colleagues - never your real name or photo.
            </p>
            <div className="mt-6 grid grid-cols-4 justify-items-center gap-4">
              {AVATAR_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setAvatarKey(preset.id)}
                  aria-pressed={avatarKey === preset.id}
                  aria-label={`Avatar colour ${preset.label}`}
                  className={`rounded-full p-1 ${
                    avatarKey === preset.id ? "ring-2 ring-primary ring-offset-2" : ""
                  }`}
                >
                  <Avatar name="Me" hue={preset.hue} size="xl" />
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 1 && (
          <div aria-busy={categoriesLoading}>
            <h1 className="text-xl font-semibold sm:text-2xl">Choose three topics</h1>
            <p className="mt-1 text-ink-muted">
              Your feed starts with these. You can change them any time in your dashboard.
            </p>
            <p aria-live="polite" className="mt-3 text-sm font-semibold text-primary-strong">
              {picked.length} of 3 selected
              {atLimit && (
                <span className="ml-2 font-medium text-ink-faint">
                  Deselect one to choose another.
                </span>
              )}
            </p>

            {categoriesLoading ? (
              <ul aria-hidden="true" className="mt-4 grid gap-2 sm:grid-cols-2">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <li key={i} className="h-14 animate-pulse rounded-md bg-band" />
                ))}
              </ul>
            ) : categoriesError ? (
              <div className="mt-4 rounded-md bg-danger-soft px-3 py-3 text-sm">
                <p role="alert" className="flex items-start gap-2 font-medium text-ink">
                  <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
                  {categoriesError}
                </p>
                <button
                  type="button"
                  onClick={reloadCategories}
                  className="mt-2 inline-flex min-h-9 items-center rounded-md border border-line bg-surface px-3 text-sm font-semibold text-ink transition-colors hover:border-primary hover:text-primary-strong"
                >
                  Try again
                </button>
              </div>
            ) : (
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {categories.map((cat) => {
                  const isPicked = picked.includes(cat.id);
                  const isDisabled = atLimit && !isPicked;
                  return (
                    <li key={cat.id}>
                      <button
                        type="button"
                        onClick={() => toggleCategory(cat.id)}
                        aria-pressed={isPicked}
                        disabled={isDisabled}
                        className={`flex min-h-14 w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-colors ${
                          isPicked
                            ? "border-primary bg-primary-soft"
                            : isDisabled
                              ? "border-line opacity-45"
                              : "border-line hover:border-line-strong"
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className="size-3 shrink-0 rounded-full"
                          style={{ background: cat.color_hex }}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold">{cat.name}</span>
                          {cat.description && (
                            <span className="block truncate text-xs text-ink-faint">
                              {cat.description}
                            </span>
                          )}
                        </span>
                        {isPicked && (
                          <Check
                            className="size-5 shrink-0 text-primary-strong"
                            aria-hidden="true"
                          />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {step === 2 && (
          <div aria-busy={orgLoading}>
            <h1 className="text-xl font-semibold sm:text-2xl">Your cohort</h1>

            {orgLoading ? (
              <div aria-hidden="true" className="mt-4 h-24 animate-pulse rounded-md bg-band" />
            ) : orgError ? (
              <div className="mt-4 rounded-md bg-danger-soft px-3 py-3 text-sm">
                <p role="alert" className="flex items-start gap-2 font-medium text-ink">
                  <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
                  {orgError}
                </p>
                <button
                  type="button"
                  onClick={reloadOrg}
                  className="mt-2 inline-flex min-h-9 items-center rounded-md border border-line bg-surface px-3 text-sm font-semibold text-ink transition-colors hover:border-primary hover:text-primary-strong"
                >
                  Try again
                </button>
              </div>
            ) : !org ? (
              <div className="mt-4 rounded-md border border-line bg-band p-4">
                <p className="font-semibold">You&rsquo;re not in a cohort yet</p>
                <p className="mt-1 text-sm text-ink-muted">
                  Your email address does not match a registered organisation. You can redeem a
                  join code later from the Cohort page.
                </p>
              </div>
            ) : org.suppressed || org.member_count === null ? (
              <div className="mt-4 rounded-md border border-line bg-band p-4">
                <p className="font-semibold">Be one of the first from your organisation</p>
                <p className="mt-1 text-sm text-ink-muted">
                  We&rsquo;ll show the count once a few more colleagues from {org.name} join.
                </p>
              </div>
            ) : (
              <div className="mt-4 rounded-md border border-line bg-band p-4">
                <p className="flex items-center gap-2 font-semibold">
                  <Users className="size-5 shrink-0 text-primary-strong" aria-hidden="true" />
                  {org.member_count} {org.member_count === 1 ? "person" : "people"} from {org.name}{" "}
                  {org.member_count === 1 ? "is" : "are"} learning here
                </p>
                {org.is_founding_member && (
                  <p className="mt-2 flex items-center gap-2 text-sm text-ink-muted">
                    <Award className="size-4 shrink-0 text-streak" aria-hidden="true" />
                    You&rsquo;re one of the first - that earns a founding member badge.
                  </p>
                )}
              </div>
            )}

            {org && (
              <div className="mt-5 rounded-md border border-line p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-semibold">
                      <ShieldCheck
                        className="size-5 shrink-0 text-primary-strong"
                        aria-hidden="true"
                      />
                      Appear in your organisation&rsquo;s list
                    </p>
                    <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
                      Off by default. While it&rsquo;s off, nobody at {org.name} can see
                      you&rsquo;re learning here - not even that you have an account. Turning it on
                      shows your nickname only, and you can turn it off again at any time.
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={org.is_visible}
                    aria-label="Appear in your organisation's list"
                    disabled={visibilityBusy}
                    onClick={() => void toggleVisibility()}
                    className={`relative h-8 w-14 shrink-0 rounded-full transition-colors disabled:opacity-60 ${
                      org.is_visible ? "bg-primary" : "bg-line-strong"
                    }`}
                  >
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
                    <AlertCircle
                      className="mt-0.5 size-3.5 shrink-0 text-danger"
                      aria-hidden="true"
                    />
                    {visibilityError}
                  </p>
                )}
              </div>
            )}

            {saveError && (
              <p
                role="alert"
                className="mt-4 flex items-start gap-2 rounded-md bg-danger-soft px-3 py-2.5 text-sm font-medium text-ink"
              >
                <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
                {saveError}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="mt-6 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setStep(Math.max(0, step - 1))}
          disabled={step === 0 || saving}
          className="inline-flex min-h-12 items-center gap-1.5 rounded-md px-4 font-semibold text-ink-muted transition-colors hover:text-ink disabled:invisible"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back
        </button>
        <button
          type="button"
          onClick={() => void next()}
          disabled={!canNext}
          className="inline-flex min-h-12 items-center gap-2 rounded-md bg-primary px-8 font-semibold text-on-primary transition-colors hover:bg-primary-strong disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          {step === 2 ? (saving ? "Saving…" : "Finish") : "Continue"}
          {!saving && <ArrowRight className="size-4" aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}
