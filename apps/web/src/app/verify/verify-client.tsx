"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { TextField } from "@/components/auth/text-field";
import { CircleCheckBigIcon, MailIcon } from "@/components/icons";

type Stage = "checking-token" | "await-code" | "verifying-code" | "verified";

/**
 * Sample verify flow, mirroring `GET/POST /api/v1/auth/verify` (T03): a
 * `?token=` in the URL (the link a real email would contain) auto-
 * verifies; without one, this shows the "check your email" state with a
 * manual token field, since no real mailer runs in this sample-data phase
 * (`lib/auth/mailer.ts` is dev-only and logs to the server console).
 */
export function VerifyClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const email = searchParams.get("email");

  const [stage, setStage] = useState<Stage>(token ? "checking-token" : "await-code");
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | undefined>();
  const [resent, setResent] = useState(false);

  useEffect(() => {
    if (stage !== "checking-token") return;
    const id = setTimeout(() => setStage("verified"), 900);
    return () => clearTimeout(id);
  }, [stage]);

  async function handleCodeSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (code.trim().length === 0) {
      setCodeError("Enter the verification code from your email.");
      return;
    }
    setCodeError(undefined);
    setStage("verifying-code");
    await new Promise((resolve) => setTimeout(resolve, 700));
    setStage("verified");
  }

  function handleResend(): void {
    setResent(true);
    setTimeout(() => setResent(false), 3000);
  }

  if (stage === "checking-token" || stage === "verifying-code") {
    return (
      <AuthCard title="Verifying your email…">
        <div className="flex items-center gap-3 text-sm text-muted">
          <span
            className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-line border-t-primary"
            aria-hidden="true"
          />
          Just a moment.
        </div>
      </AuthCard>
    );
  }

  if (stage === "verified") {
    return (
      <AuthCard title="Email verified">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-success/10 text-success">
            <CircleCheckBigIcon size={18} />
          </span>
          <p className="text-sm leading-relaxed text-muted">
            Your email is verified. You can sign in and start today&apos;s brief.
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.push("/signin")}
          className="mt-6 w-full cursor-pointer rounded-control bg-primary px-4 py-3 text-sm font-semibold text-on-primary transition-colors duration-200 hover:bg-primary-hover"
        >
          Continue to sign in
        </button>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Check your email"
      subtitle={email ? `We sent a verification link to ${email}.` : "We sent you a verification link."}
    >
      <div className="mb-6 flex items-start gap-3 rounded-control border border-line bg-background p-3">
        <MailIcon size={18} className="mt-0.5 shrink-0 text-muted" />
        <p className="text-sm text-muted">
          Click the link in that email to verify your account. Didn&apos;t get it?{" "}
          <button
            type="button"
            onClick={handleResend}
            className="cursor-pointer font-medium text-primary hover:text-primary-hover"
          >
            Resend it
          </button>
          {resent && <span className="ml-1 text-success">Sent.</span>}
        </p>
      </div>

      <form onSubmit={handleCodeSubmit} noValidate className="space-y-4">
        <TextField
          id="verify-code"
          label="Or enter your verification code"
          value={code}
          onChange={setCode}
          error={codeError}
          autoComplete="one-time-code"
        />
        <button
          type="submit"
          className="w-full cursor-pointer rounded-control border border-primary px-4 py-3 text-sm font-semibold text-primary transition-colors duration-200 hover:bg-primary/5"
        >
          Verify
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        Wrong email?{" "}
        <Link href="/signup" className="cursor-pointer font-medium text-primary hover:text-primary-hover">
          Start over
        </Link>
      </p>
    </AuthCard>
  );
}
