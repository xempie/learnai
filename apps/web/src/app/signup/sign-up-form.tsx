"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { TextField } from "@/components/auth/text-field";
import { EyeIcon, EyeOffIcon, TriangleAlertIcon } from "@/components/icons";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DISPOSABLE_DOMAINS = ["mailinator.com", "10minutemail.com", "guerrillamail.com"];

function validateEmail(value: string): string | undefined {
  if (value.trim().length === 0) return "Enter your email address.";
  if (!EMAIL_PATTERN.test(value)) return "Enter a valid email address.";
  const domain = value.split("@")[1]?.toLowerCase();
  if (domain && DISPOSABLE_DOMAINS.includes(domain)) {
    return "Please use a permanent email address.";
  }
  return undefined;
}

function validatePassword(value: string): string | undefined {
  if (value.length === 0) return "Choose a password.";
  if (value.length < 8) return "Use at least 8 characters.";
  return undefined;
}

function validateConfirm(password: string, confirm: string): string | undefined {
  if (confirm.length === 0) return "Confirm your password.";
  if (confirm !== password) return "Passwords don't match.";
  return undefined;
}

/**
 * Sample sign-up flow: same field-level validation shape as the real
 * `POST /api/v1/auth/signup` (T03) — email + password — then fakes success
 * and sends the visitor on to `/verify`, mirroring the real flow's next
 * step (§8: signup triggers a verification email).
 */
export function SignUpForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [touched, setTouched] = useState<{ email?: boolean; password?: boolean; confirm?: boolean }>({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const emailError = touched.email ? validateEmail(email) : undefined;
  const passwordError = touched.password ? validatePassword(password) : undefined;
  const confirmError = touched.confirm ? validateConfirm(password, confirm) : undefined;

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setTouched({ email: true, password: true, confirm: true });
    setFormError(null);
    if (validateEmail(email) || validatePassword(password) || validateConfirm(password, confirm)) {
      return;
    }

    setSubmitting(true);
    await new Promise((resolve) => setTimeout(resolve, 700));
    setSubmitting(false);

    // Sample flow: one reserved address demonstrates the "already
    // registered" error + recovery path without a real backend.
    if (email.toLowerCase() === "taken@example.com") {
      setFormError("An account with this email already exists.");
      return;
    }
    router.push(`/verify?email=${encodeURIComponent(email)}`);
  }

  return (
    <AuthCard
      title="Create your account"
      subtitle="A daily AI-literacy brief for Australian professionals."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/signin" className="cursor-pointer font-medium text-primary hover:text-primary-hover">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <TextField
          id="signup-email"
          label="Work email address"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={setEmail}
          onBlur={() => setTouched((t) => ({ ...t, email: true }))}
          error={emailError}
        />
        <TextField
          id="signup-password"
          label="Password"
          type={showPassword ? "text" : "password"}
          autoComplete="new-password"
          required
          value={password}
          onChange={setPassword}
          onBlur={() => setTouched((t) => ({ ...t, password: true }))}
          error={passwordError}
          rightSlot={
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="cursor-pointer text-muted transition-colors duration-200 hover:text-foreground"
            >
              {showPassword ? <EyeOffIcon size={17} /> : <EyeIcon size={17} />}
            </button>
          }
        />
        <TextField
          id="signup-confirm"
          label="Confirm password"
          type={showPassword ? "text" : "password"}
          autoComplete="new-password"
          required
          value={confirm}
          onChange={setConfirm}
          onBlur={() => setTouched((t) => ({ ...t, confirm: true }))}
          error={confirmError}
        />

        {formError && (
          <p role="alert" className="flex items-center gap-1.5 text-sm font-medium text-danger">
            <TriangleAlertIcon size={14} />
            {formError}{" "}
            <Link href="/signin" className="cursor-pointer underline hover:no-underline">
              Sign in instead
            </Link>
          </p>
        )}

        <p className="text-xs leading-relaxed text-muted">
          By creating an account you agree Learn AI can email you a daily brief. Unsubscribe anytime.
        </p>

        <button
          type="submit"
          disabled={submitting}
          className="w-full cursor-pointer rounded-control bg-primary px-4 py-3 text-sm font-semibold text-on-primary transition-colors duration-200 hover:bg-primary-hover disabled:cursor-default disabled:opacity-70"
        >
          {submitting ? "Creating account…" : "Create account"}
        </button>
      </form>
    </AuthCard>
  );
}
