"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, Eye, EyeOff, Loader2, Users } from "lucide-react";
import { GoogleButton } from "@/components/login-form";
import { ApiClientError, api } from "@/lib/api-client";
import { AGE_RANGES } from "@/lib/constants";

const GOOGLE_ENABLED = process.env.NEXT_PUBLIC_GOOGLE_LOGIN_ENABLED !== "false";

/** Field-level message under an input, wired to the input via aria-describedby. */
function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1.5 flex items-start gap-1.5 text-sm text-danger">
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      {message}
    </p>
  );
}

/**
 * V1_BUILD_SPEC §4.1 steps 1-3: credentials, age gate (hard reject under 16),
 * explicit terms acceptance. The age gate is enforced client-side AND by the
 * server - the client copy is the friendly version, the 422 is the real one.
 */
export function SignupForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [ageRange, setAgeRange] = useState<string>("");
  const [underage, setUnderage] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (underage || !ageRange || busy) return;

    setBusy(true);
    setError(null);
    setFieldErrors({});

    try {
      await api.post<{ needs_verification: boolean; email: string }>("/auth/signup", {
        email,
        password,
        nickname,
        ageRange,
        termsAccepted,
      });
      router.push(`/verify?email=${encodeURIComponent(email)}`);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
        setFieldErrors(err.fieldErrors ?? {});
        // The server owns the age gate too; if it fires, say so where the
        // control is rather than only at the top of the form.
        if (err.fieldErrors?.ageRange) setUnderage(false);
      } else {
        setError("We could not create your account. Check your connection and try again.");
      }
      setBusy(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">Create your account</h1>
      <p className="mt-1 text-ink-muted">Free to start - three episodes, no card required.</p>

      {error && (
        <p
          role="alert"
          className="mt-5 flex items-start gap-2 rounded-md bg-danger-soft px-3 py-2.5 text-sm font-medium text-ink"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
          {error}
        </p>
      )}

      <form onSubmit={submit} className="mt-7 flex flex-col gap-4">
        <div>
          <label htmlFor="email" className="block font-semibold">
            Work or university email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            placeholder="you@yourorg.edu.au"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={fieldErrors.email ? true : undefined}
            aria-describedby={fieldErrors.email ? "email-error" : "email-hint"}
            className="mt-2 h-12 w-full rounded-field border border-line bg-surface px-4 font-medium placeholder:text-ink-faint focus:border-primary"
          />
          <FieldError id="email-error" message={fieldErrors.email} />
          <p id="email-hint" className="mt-1.5 flex items-start gap-1.5 text-sm text-ink-faint">
            <Users className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            Using your organisation email places you in your colleagues&rsquo; cohort
            automatically.
          </p>
        </div>

        <div>
          <label htmlFor="nickname" className="block font-semibold">
            Nickname
          </label>
          <input
            id="nickname"
            name="nickname"
            type="text"
            required
            minLength={2}
            maxLength={32}
            autoComplete="nickname"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            aria-invalid={fieldErrors.nickname ? true : undefined}
            aria-describedby={fieldErrors.nickname ? "nickname-error" : "nickname-hint"}
            className="mt-2 h-12 w-full rounded-field border border-line bg-surface px-4 font-medium focus:border-primary"
          />
          <FieldError id="nickname-error" message={fieldErrors.nickname} />
          <p id="nickname-hint" className="mt-1.5 text-sm text-ink-faint">
            Shown publicly instead of your real name.
          </p>
        </div>

        <div>
          <label htmlFor="password" className="block font-semibold">
            Password
          </label>
          <div className="relative mt-2">
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              required
              minLength={10}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={fieldErrors.password ? true : undefined}
              aria-describedby={fieldErrors.password ? "password-error" : "password-hint"}
              className="h-12 w-full rounded-field border border-line bg-surface px-4 pr-14 font-medium focus:border-primary"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              className="absolute right-1 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-lg text-ink-faint hover:bg-band hover:text-ink"
            >
              {showPassword ? (
                <EyeOff className="size-5" aria-hidden="true" />
              ) : (
                <Eye className="size-5" aria-hidden="true" />
              )}
            </button>
          </div>
          <FieldError id="password-error" message={fieldErrors.password} />
          <p id="password-hint" className="mt-1.5 text-sm text-ink-faint">
            At least 10 characters.
          </p>
        </div>

        {/* Age gate - §9.4, under-16 registrations are rejected */}
        <fieldset>
          <legend className="font-semibold">Your age range</legend>
          <p className="mt-0.5 text-sm text-ink-faint">Learn AI is for people aged 16 and over.</p>
          <select
            id="age-range"
            aria-label="Your age range"
            required
            value={underage ? "under-16" : ageRange}
            onChange={(e) => {
              const v = e.target.value;
              setUnderage(v === "under-16");
              setAgeRange(v === "under-16" ? "" : v);
              setFieldErrors((prev) => ({ ...prev, ageRange: "" }));
            }}
            aria-invalid={fieldErrors.ageRange ? true : undefined}
            aria-describedby={fieldErrors.ageRange ? "age-error" : undefined}
            className="mt-2 h-12 w-full rounded-field border border-line bg-surface px-3 font-medium focus:border-primary"
          >
            <option value="">Select your age range…</option>
            <option value="under-16">Under 16</option>
            {AGE_RANGES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <FieldError id="age-error" message={fieldErrors.ageRange || undefined} />
          {underage && (
            <p
              role="alert"
              className="mt-2 flex items-start gap-2 rounded-md bg-danger-soft px-3 py-2.5 text-sm text-ink"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
              <span>
                <strong className="font-semibold text-danger">
                  You need to be 16 or older to sign up.
                </strong>{" "}
                Learn AI isn&rsquo;t designed for under-16s, and we don&rsquo;t collect their
                data. Ask a teacher or parent about supervised alternatives.
              </span>
            </p>
          )}
        </fieldset>

        <div>
          <label className="flex cursor-pointer items-start gap-3 rounded-md border border-line p-3.5">
            <input
              type="checkbox"
              required
              checked={termsAccepted}
              onChange={(e) => setTermsAccepted(e.target.checked)}
              aria-invalid={fieldErrors.termsAccepted ? true : undefined}
              aria-describedby={fieldErrors.termsAccepted ? "terms-error" : undefined}
              className="mt-0.5 size-5 shrink-0 accent-[var(--color-primary)]"
            />
            <span className="text-sm text-ink-muted">
              I agree to the{" "}
              <Link href="/terms" className="font-semibold text-primary-strong hover:underline">
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link href="/privacy" className="font-semibold text-primary-strong hover:underline">
                Privacy Policy
              </Link>
              .
            </span>
          </label>
          <FieldError id="terms-error" message={fieldErrors.termsAccepted} />
        </div>

        <button
          type="submit"
          disabled={underage || !ageRange || busy}
          className="mt-2 inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-primary font-semibold text-on-primary transition-colors hover:bg-primary-strong disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          {busy ? "Creating account…" : "Create account"}
        </button>
      </form>

      {GOOGLE_ENABLED && (
        <div className="mt-4">
          <GoogleButton label="Continue with Google" />
        </div>
      )}

      <p className="mt-6 text-center text-ink-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-primary-strong hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
