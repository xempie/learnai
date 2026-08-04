import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { BRAND } from "@/lib/brand";

const SERVICE_LINKS = [
  { href: "/services/workshops", label: "Workshops" },
  { href: "/services/advisory", label: "Advisory" },
  { href: "/services/pilot-sprint", label: "Pilot Sprint" },
  { href: "/services/training", label: "1:1 training" },
  { href: "/enquiry", label: "Enquire" },
];

/**
 * Shared chrome for the services marketing surface (workshops, advisory,
 * pilot sprint, training, enquiry). Reuses the landing page's Tailwind
 * vocabulary so the two surfaces read as one site.
 */
export function ServiceShell({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-surface">
      {/* ===== Header ===== */}
      <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-16 page-container items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 font-display text-xl font-bold">
            <span className="flex size-9 items-center justify-center rounded-md bg-primary text-on-primary">
              <GraduationCap className="size-5" aria-hidden="true" />
            </span>
            {BRAND.name}
          </Link>
          <nav aria-label="Header" className="flex items-center gap-1">
            {SERVICE_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="hidden min-h-11 items-center rounded-md px-3 font-semibold text-ink-muted hover:text-ink sm:inline-flex"
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/login"
              className="inline-flex min-h-11 items-center rounded-md px-4 font-semibold text-ink-muted hover:text-ink"
            >
              Log in
            </Link>
          </nav>
        </div>
      </header>

      <main>
        {/* ===== Page intro ===== */}
        <section className="mx-auto page-container px-4 py-10 sm:px-6 sm:py-16">
          <p className="text-sm font-medium tracking-[0.08em] text-[#816729] uppercase">
            {eyebrow}
          </p>
          <h1 className="mt-3 text-[32px] leading-[1.05] sm:text-[44px] sm:leading-[1.02]">
            {title}
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-ink-muted">{subtitle}</p>
        </section>

        {/* ===== Content column ===== */}
        <div className="mx-auto max-w-2xl page-container px-4 pb-12 sm:px-6 sm:pb-16">
          {children}
        </div>

        {/* ===== Closing CTA banner ===== */}
        <section className="border-t border-line bg-band">
          <div className="mx-auto flex page-container flex-col items-center gap-4 px-4 py-12 text-center sm:px-6 sm:py-16">
            <h2 className="text-2xl sm:text-3xl">Ready to talk?</h2>
            <p className="max-w-md text-ink-muted">
              Tell us what you&rsquo;re trying to do. We reply within one business day.
            </p>
            <Link
              href="/enquiry"
              className="inline-flex min-h-13 items-center gap-2 rounded-md bg-primary px-7 text-lg font-semibold text-on-primary transition-colors hover:bg-primary-strong"
            >
              Talk to us about your team
            </Link>
          </div>
        </section>
      </main>

      {/* ===== Footer ===== */}
      <footer className="border-t border-line bg-band">
        <div className="mx-auto flex page-container flex-col items-center gap-3 px-4 py-8 text-center text-sm text-ink-faint sm:flex-row sm:justify-between sm:text-left">
          <p className="flex items-center gap-2 font-semibold text-ink-muted">
            <GraduationCap className="size-4 text-primary-strong" aria-hidden="true" />
            {BRAND.name} · {BRAND.domain}
          </p>
          <nav aria-label="Footer" className="flex flex-wrap justify-center gap-5">
            <Link href="/privacy" className="hover:text-ink">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-ink">
              Terms
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
