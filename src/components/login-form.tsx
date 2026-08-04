"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, ArrowLeft, Check, Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import { ApiClientError, api } from "@/lib/api-client";

type Mode = "signin" | "forgot" | "reset";

const FIELD =
  "h-12 w-full rounded-field border border-line bg-surface px-4 font-medium text-ink placeholder:text-ink-faint focus:border-primary";
const LABEL = "mb-1.5 block text-sm font-semibold text-ink";

/** Federated sign-in is a redirect flow, so it must be a real link, not fetch. */
const GOOGLE_ENABLED = process.env.NEXT_PUBLIC_GOOGLE_LOGIN_ENABLED !== "false";

export function GoogleButton({ label }: { label: string }) {
  if (!GOOGLE_ENABLED) return null;
  return (
    <a
      href="/api/v1/auth/google"
      className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md border border-line bg-surface font-semibold text-ink transition-colors hover:border-primary hover:text-primary-strong"
    >
      <GoogleMark />
      {label}
    </a>
  );
}

function GoogleMark() {
  return (
    <svg className="size-5" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59A14.5 14.5 0 0 1 9.77 24c0-1.6.28-3.14.76-4.59l-7.98-6.19A23.94 23.94 0 0 0 0 24c0 3.88.93 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.9-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.17 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

export function LoginForm() {
  return (
    // useSearchParams needs a boundary; the fallback matches the signed-out
    // frame so the page never flashes empty.
    <Suspense fallback={<LoginSkeleton />}>
      <LoginFormInner />
    </Suspense>
  );
}

function LoginSkeleton() {
  return (
    <div aria-busy="true">
      <p className="sr-only">Loading the sign-in form</p>
      <span aria-hidden="true" className="block h-8 w-32 animate-pulse rounded bg-band" />
      <span aria-hidden="true" className="mt-3 block h-5 w-64 animate-pulse rounded bg-band" />
      <span aria-hidden="true" className="mt-7 block h-12 w-full animate-pulse rounded-field bg-band" />
      <span aria-hidden="true" className="mt-4 block h-12 w-full animate-pulse rounded-field bg-band" />
    </div>
  );
}

function LoginFormInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function go(next: Mode) {
    setMode(next);
    setInfo(null);
    setError(null);
  }

  /** Only same-origin paths, so `?next=` can never bounce someone off-site. */
  function destination(): string {
    const next = searchParams.get("next");
    if (next && next.startsWith("/") && !next.startsWith("//")) return next;
    return "/feed";
  }

  async function submitSignIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await api.post<{ user: { id: string } }>("/auth/login", { email, password });
      router.push(destination());
      router.refresh();
    } catch (err) {
      // The API writes these messages for users; show them verbatim.
      setError(
        err instanceof ApiClientError
          ? err.message
          : "We could not sign you in. Check your connection and try again.",
      );
      setBusy(false);
    }
  }

  async function submitForgot(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ message: string }>("/auth/forgot-password", { email });
      setInfo(res.message);
      setMode("reset");
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "We could not send a reset code. Try again in a moment.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitReset(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError("Those passwords do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ message: string }>("/auth/reset-password", {
        email,
        code,
        newPassword,
      });
      setInfo(res.message);
      setCode("");
      setNewPassword("");
      setConfirmPassword("");
      setMode("signin");
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "We could not reset your password. Try again in a moment.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {info && (
        <p
          role="status"
          className="mb-5 flex items-start gap-2 rounded-md bg-success-soft px-3 py-2.5 text-sm font-medium text-success"
        >
          <Check className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {info}
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="mb-5 flex items-start gap-2 rounded-md bg-danger-soft px-3 py-2.5 text-sm font-medium text-ink"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
          {error}
        </p>
      )}

      {mode === "signin" && (
        <>
          <h1 className="text-2xl font-semibold">Sign in</h1>
          <p className="mt-1 text-ink-muted">Welcome back. Use your work or university account.</p>

          <form onSubmit={submitSignIn} className="mt-7 flex flex-col gap-4">
            <div>
              <label htmlFor="email" className={LABEL}>
                Email
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
                className={FIELD}
              />
            </div>

            <div>
              <div className="mb-1.5 flex items-baseline justify-between gap-3">
                <label htmlFor="password" className={`${LABEL} mb-0`}>
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => go("forgot")}
                  className="text-sm font-semibold text-primary-strong hover:underline"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={show ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${FIELD} pr-14`}
                />
                <button
                  type="button"
                  onClick={() => setShow(!show)}
                  aria-label={show ? "Hide password" : "Show password"}
                  aria-pressed={show}
                  className="absolute right-1 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-md text-ink-faint hover:bg-band hover:text-ink"
                >
                  {show ? (
                    <EyeOff className="size-5" aria-hidden="true" />
                  ) : (
                    <Eye className="size-5" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="mt-1 inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-primary font-semibold text-on-primary transition-colors hover:bg-primary-strong disabled:opacity-60"
            >
              {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>

          {GOOGLE_ENABLED && (
            <div className="mt-4">
              <GoogleButton label="Continue with Google" />
            </div>
          )}

          <div className="my-6 flex items-center gap-3 text-xs text-ink-faint">
            <span className="h-px flex-1 bg-line" />
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="size-3.5" aria-hidden="true" />
              Single sign-on available for organisations
            </span>
            <span className="h-px flex-1 bg-line" />
          </div>

          <p className="text-center text-ink-muted">
            New here?{" "}
            <Link href="/signup" className="font-semibold text-primary-strong hover:underline">
              Create an account
            </Link>
          </p>
        </>
      )}

      {mode === "forgot" && (
        <>
          <button
            type="button"
            onClick={() => go("signin")}
            className="mb-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-ink-muted hover:text-ink"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to sign in
          </button>
          <h1 className="text-2xl font-semibold">Reset your password</h1>
          <p className="mt-1 text-ink-muted">
            Enter your account email and we&rsquo;ll send a verification code.
          </p>

          <form onSubmit={submitForgot} className="mt-7 flex flex-col gap-4">
            <div>
              <label htmlFor="forgot-email" className={LABEL}>
                Email
              </label>
              <input
                id="forgot-email"
                type="email"
                required
                autoComplete="email"
                inputMode="email"
                placeholder="you@yourorg.edu.au"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={FIELD}
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="mt-1 inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-primary font-semibold text-on-primary transition-colors hover:bg-primary-strong disabled:opacity-60"
            >
              {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              {busy ? "Sending…" : "Send reset code"}
            </button>
          </form>
        </>
      )}

      {mode === "reset" && (
        <>
          <button
            type="button"
            onClick={() => go("forgot")}
            className="mb-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-ink-muted hover:text-ink"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Use a different email
          </button>
          <h1 className="text-2xl font-semibold">Set a new password</h1>
          <p className="mt-1 text-ink-muted">
            Enter the code we sent{email ? ` to ${email}` : ""}, then choose a new password.
          </p>

          <form onSubmit={submitReset} className="mt-7 flex flex-col gap-4">
            <div>
              <label htmlFor="code" className={LABEL}>
                Verification code
              </label>
              <input
                id="code"
                required
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="6-digit code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className={`${FIELD} tabular-nums`}
              />
            </div>
            <div>
              <label htmlFor="new-password" className={LABEL}>
                New password
              </label>
              <input
                id="new-password"
                type="password"
                required
                minLength={10}
                autoComplete="new-password"
                placeholder="At least 10 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className={FIELD}
              />
            </div>
            <div>
              <label htmlFor="confirm-password" className={LABEL}>
                Confirm new password
              </label>
              <input
                id="confirm-password"
                type="password"
                required
                minLength={10}
                autoComplete="new-password"
                placeholder="Repeat new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={FIELD}
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="mt-1 inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-primary font-semibold text-on-primary transition-colors hover:bg-primary-strong disabled:opacity-60"
            >
              {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              {busy ? "Updating…" : "Set new password"}
            </button>
          </form>
        </>
      )}
    </div>
  );
}
