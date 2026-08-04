import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BRAND } from "@/lib/brand";

export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-band">
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary-strong hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to {BRAND.name}
        </Link>

        <article className="mt-4 rounded-card border border-line bg-surface p-6 shadow-xs sm:p-10">
          <header className="border-b border-line pb-6">
            <h1 className="text-3xl font-bold sm:text-4xl">{title}</h1>
            <p className="mt-2 text-sm font-medium text-ink-faint">Last updated {updated}</p>
          </header>

          <div className="max-w-3xl">{children}</div>
        </article>

        <p className="mt-6 text-center text-sm text-ink-faint">
          <Link href="/privacy" className="font-semibold hover:text-primary-strong">
            Privacy
          </Link>
          <span aria-hidden="true" className="px-2">
            ·
          </span>
          <Link href="/terms" className="font-semibold hover:text-primary-strong">
            Terms
          </Link>
        </p>
      </div>
    </div>
  );
}
