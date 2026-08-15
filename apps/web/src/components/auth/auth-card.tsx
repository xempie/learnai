import Link from "next/link";
import type { ReactNode } from "react";

/** Shared single-column layout for /signin, /signup, /verify. */
export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-8rem)] max-w-sm flex-col justify-center px-4 py-12 sm:px-6">
      <Link href="/" className="mb-8 self-start font-heading text-xl font-semibold text-primary">
        Learn AI
      </Link>
      <div className="rounded-card border border-line bg-surface p-6 sm:p-8">
        <h1 className="font-heading text-xl font-semibold text-foreground">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>
      {footer && <div className="mt-4 text-center text-sm text-muted">{footer}</div>}
    </div>
  );
}
