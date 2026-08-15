"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { TextField } from "@/components/auth/text-field";
import { EyeIcon, EyeOffIcon, TriangleAlertIcon } from "@/components/icons";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(value: string): string | undefined {
  if (value.trim().length === 0) return "Enter your email address.";
  if (!EMAIL_PATTERN.test(value)) return "Enter a valid email address.";
  return undefined;
}

function validatePassword(value: string): string | undefined {
  if (value.length === 0) return "Enter your password.";
  return undefined;
}

/**
 * Sample sign-in flow: validates inline, then fakes a successful sign-in
 * and redirects home. The real session-issuing route is Auth.js (T03,
 * `lib/auth/`) — this page is the UI the real flow can adopt once it's
 * wired to a client-side form (T03 shipped API routes only).
 */
export function SignInForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [touched, setTouched] = useState<{ email?: boolean; password?: boolean }>({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const emailError = touched.email ? validateEmail(email) : undefined;
  const passwordError = touched.password ? validatePassword(password) : undefined;

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setTouched({ email: true, password: true });
    setFormError(null);
    if (validateEmail(email) || validatePassword(password)) return;

    setSubmitting(true);
    await new Promise((resolve) => setTimeout(resolve, 700));
    setSubmitting(false);

    // Sample flow: any well-formed email/password combination succeeds,
    // except this one reserved value — exercises the error + recovery
    // copy path without a real backend to reject a bad password.
    if (password === "wrongpassword") {
      setFormError("That email and password don't match our records. Double-check your password and try again.");
      return;
    }
    router.push("/");
  }

  return (
    <AuthCard
      title="Sign in"
      subtitle="Welcome back to Learn AI."
      footer={
        <>
          New here?{" "}
          <Link href="/signup" className="cursor-pointer font-medium text-primary hover:text-primary-hover">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <TextField
          id="signin-email"
          label="Email address"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={setEmail}
          onBlur={() => setTouched((t) => ({ ...t, email: true }))}
          error={emailError}
        />
        <TextField
          id="signin-password"
          label="Password"
          type={showPassword ? "text" : "password"}
          autoComplete="current-password"
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

        {formError && (
          <p role="alert" className="flex items-center gap-1.5 text-sm font-medium text-danger">
            <TriangleAlertIcon size={14} />
            {formError}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full cursor-pointer rounded-control bg-primary px-4 py-3 text-sm font-semibold text-on-primary transition-colors duration-200 hover:bg-primary-hover disabled:cursor-default disabled:opacity-70"
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </AuthCard>
  );
}
