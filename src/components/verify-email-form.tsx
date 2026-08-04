"use client";

import { Suspense, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, Loader2, MailCheck, Terminal } from "lucide-react";
import { ApiClientError, api } from "@/lib/api-client";

const IS_DEV = process.env.NODE_ENV !== "production";

/** V1_BUILD_SPEC §4.1 step 4 - 6-digit code, blocks onboarding. */
export function VerifyEmailForm() {
  return (
    <Suspense fallback={<VerifySkeleton />}>
      <VerifyEmailFormInner />
    </Suspense>
  );
}

function VerifySkeleton() {
  return (
    <div className="text-center" aria-busy="true">
      <p className="sr-only">Loading the verification form</p>
      <span
        aria-hidden="true"
        className="mx-auto block size-14 animate-pulse rounded-full bg-band"
      />
      <span aria-hidden="true" className="mx-auto mt-4 block h-8 w-52 animate-pulse rounded bg-band" />
      <span aria-hidden="true" className="mx-auto mt-3 block h-5 w-72 animate-pulse rounded bg-band" />
    </div>
  );
}

function VerifyEmailFormInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get("email") ?? "";

  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [resentMessage, setResentMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  const code = digits.join("");
  const complete = code.length === 6;

  function setDigit(i: number, value: string) {
    const char = value.replace(/\D/g, "").slice(-1);
    setDigits((prev) => {
      const next = [...prev];
      next[i] = char;
      return next;
    });
    setError(null);
    if (char && i < 5) inputs.current[i + 1]?.focus();
  }

  function onKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[i] && i > 0) inputs.current[i - 1]?.focus();
  }

  function onPaste(e: React.ClipboardEvent) {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    e.preventDefault();
    setDigits(Array.from({ length: 6 }, (_, i) => pasted[i] ?? ""));
    inputs.current[Math.min(pasted.length, 5)]?.focus();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!complete || busy) return;
    if (!email) {
      setError("We do not know which address to verify. Start again from the sign-up form.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await api.post<{ user: { id: string } }>("/auth/verify-email", { email, code });
      // Verifying signs you in, so onboarding is reachable straight away.
      router.push("/onboarding");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "We could not verify that code. Check your connection and try again.",
      );
      setBusy(false);
    }
  }

  async function resend() {
    if (resending) return;
    if (!email) {
      setError("We do not know which address to send to. Start again from the sign-up form.");
      return;
    }
    setResending(true);
    setError(null);
    setResentMessage(null);
    try {
      const res = await api.post<{ message: string }>("/auth/resend-code", { email });
      setResentMessage(res.message);
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "We could not send a new code. Try again in a moment.",
      );
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="text-center">
      <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary-soft">
        <MailCheck className="size-7 text-primary-strong" aria-hidden="true" />
      </span>
      <h1 className="mt-4 text-2xl font-semibold">Check your email</h1>
      <p className="mt-2 text-ink-muted">
        We sent a 6-digit code to {email || "your address"}. Enter it below to verify your account.
      </p>

      {IS_DEV && (
        <p className="mx-auto mt-4 flex max-w-sm items-start gap-2 rounded-md bg-band px-3 py-2 text-left text-xs leading-relaxed text-ink-faint">
          <Terminal className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          Development build: the code is printed to the server console instead of being emailed.
          Look for &quot;[dev] verification code&quot; in the terminal running the app.
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="mt-4 flex items-start gap-2 rounded-md bg-danger-soft px-3 py-2.5 text-left text-sm font-medium text-ink"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
          {error}
        </p>
      )}

      <form onSubmit={submit} className="mt-6">
        <fieldset disabled={busy}>
          <legend className="sr-only">Verification code</legend>
          <div className="flex justify-center gap-2" onPaste={onPaste}>
            {digits.map((d, i) => (
              <input
                key={i}
                ref={(el) => {
                  inputs.current[i] = el;
                }}
                type="text"
                inputMode="numeric"
                autoComplete={i === 0 ? "one-time-code" : "off"}
                aria-label={`Digit ${i + 1} of 6`}
                value={d}
                onChange={(e) => setDigit(i, e.target.value)}
                onKeyDown={(e) => onKeyDown(i, e)}
                className="h-14 w-11 rounded-field border border-line bg-surface text-center text-xl font-semibold tabular-nums focus:border-primary disabled:opacity-60 sm:w-12"
              />
            ))}
          </div>
        </fieldset>

        <button
          type="submit"
          disabled={!complete || busy}
          className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-primary font-semibold text-on-primary transition-colors hover:bg-primary-strong disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          {busy ? "Verifying…" : "Verify email"}
        </button>
      </form>

      <p className="mt-5 text-sm text-ink-muted">
        Didn&rsquo;t get it? Check your spam folder, or{" "}
        <button
          type="button"
          onClick={() => void resend()}
          disabled={resending}
          className="font-semibold text-primary-strong hover:underline disabled:opacity-60"
        >
          {resending ? "sending…" : "send a new code"}
        </button>
        .
      </p>
      <p aria-live="polite" className="mt-1 text-sm font-semibold text-success">
        {resentMessage ?? ""}
      </p>

      <p className="mt-6 border-t border-line pt-4 text-xs text-ink-faint">
        Your organisation cohort is only assigned after your email is verified.
      </p>
    </div>
  );
}
