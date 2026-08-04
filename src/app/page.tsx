import Link from "next/link";
import type { Metadata } from "next";
import {
  Award,
  BadgeCheck,
  Building2,
  CircleHelp,
  Clock3,
  Flame,
  GraduationCap,
  Medal,
  Play,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  BrowseTopics,
  DiscoverySections,
  HowItWorks,
  LatestUpdates,
} from "@/components/marketing-sections";
import { BRAND } from "@/lib/brand";

// The discovery rails read live topic data, so this page is rendered per request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `${BRAND.name} - ${BRAND.tagline}`,
};

const FEATURES = [
  {
    icon: Clock3,
    title: "Five-minute episodes",
    body: "Fits a working day, not a training day.",
  },
  {
    icon: CircleHelp,
    title: "Assessed, not watched",
    body: "A quiz after every episode. Completion means competence.",
  },
  {
    icon: BadgeCheck,
    title: "Human-reviewed",
    body: "Every episode checked before it publishes.",
  },
  {
    icon: Users,
    title: "Organisation cohorts",
    body: "Work email puts staff in your cohort automatically.",
  },
  {
    icon: TrendingUp,
    title: "Aggregate reporting",
    body: "See adoption by team. Individual results stay private.",
  },
  {
    icon: ShieldCheck,
    title: "Private by default",
    body: "Nobody sees you learning unless you opt in.",
  },
];

export default function LandingPage() {
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
          <nav aria-label="Header" className="flex items-center gap-2">
            <Link
              href="/login"
              className="inline-flex min-h-11 items-center rounded-md px-4 font-semibold text-ink-muted hover:text-ink"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="inline-flex min-h-11 items-center rounded-md bg-primary px-5 font-semibold text-on-primary transition-colors hover:bg-primary-strong"
            >
              Start free
            </Link>
          </nav>
        </div>
      </header>

      <main>
        {/* ===== Hero ===== */}
        <section className="mx-auto grid page-container items-center gap-10 px-4 py-10 sm:px-6 sm:py-20 lg:grid-cols-2">
          <div>
            <p className="inline-flex items-center gap-1.5 text-sm font-medium tracking-[0.08em] text-[#816729] uppercase">
              <Sparkles className="size-4" aria-hidden="true" />
              Workforce AI literacy
            </p>
            <h1 className="mt-4 text-[34px] leading-[1.05] sm:text-[52px] lg:text-[66px] lg:leading-[0.91]">
              Become the person your team asks about AI.
            </h1>
            <p className="mt-4 max-w-md text-lg text-ink-muted">
              Five-minute episodes. Human-reviewed. Start free.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                href="/signup"
                className="inline-flex min-h-13 items-center gap-2 rounded-md bg-primary px-7 text-lg font-semibold text-on-primary transition-colors hover:bg-primary-strong"
              >
                <Play className="size-5 fill-current" aria-hidden="true" />
                Start free
              </Link>
              <p className="text-sm font-medium text-ink-faint">Free · no card needed</p>
            </div>
          </div>

          {/* Product mock - decorative, desktop only to keep mobile short */}
          <div
            className="relative mx-auto hidden w-full max-w-md lg:block"
            aria-hidden="true"
          >
            <div className="rounded-lg border border-line bg-band p-5 shadow-lg">
              <div className="rounded-md border border-line bg-surface p-5">
                <div className="flex items-center gap-3">
                  <span className="flex size-11 items-center justify-center rounded-md bg-streak-soft">
                    <Flame className="size-6 text-streak-bright" />
                  </span>
                  <div>
                    <p className="font-display text-2xl font-semibold leading-none">12 days</p>
                    <p className="mt-1 text-sm text-ink-faint">Current streak</p>
                  </div>
                  <span className="ml-auto text-xs font-medium text-ink-faint">Best: 21</span>
                </div>
              </div>
              <div className="mt-4 rounded-md border border-line bg-surface p-4">
                <p className="flex items-center justify-between text-sm font-bold">
                  <span className="flex items-center gap-1.5">
                    <Building2 className="size-4 text-primary-strong" />
                    Adelaide University
                  </span>
                  <span className="text-xs font-bold text-ink-faint">This week</span>
                </p>
                <ul className="mt-3 space-y-2.5">
                  {[
                    { rank: 1, name: "quokka_energy", pts: 320, hue: 190 },
                    { rank: 2, name: "drbyte", pts: 265, hue: 320 },
                    { rank: 3, name: "you", pts: 240, hue: 245, you: true },
                  ].map((r) => (
                    <li
                      key={r.rank}
                      className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 ${
                        r.you ? "bg-primary-soft" : ""
                      }`}
                    >
                      <Medal
                        className={`size-4 ${
                          r.rank === 1
                            ? "text-streak-bright"
                            : r.rank === 2
                              ? "text-line-strong"
                              : "text-streak"
                        }`}
                      />
                      <span
                        className="flex size-7 items-center justify-center rounded-full text-[10px] font-bold"
                        style={{
                          background: `hsl(${r.hue} 70% 85%)`,
                          color: `hsl(${r.hue} 65% 25%)`,
                        }}
                      >
                        {r.name.slice(0, 2).toUpperCase()}
                      </span>
                      <span className={`text-sm font-semibold ${r.you ? "text-primary-strong" : ""}`}>
                        {r.name}
                      </span>
                      <span className="ml-auto text-xs font-bold tabular-nums text-ink-faint">
                        {r.pts} pts
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-4 flex items-center gap-3 rounded-md border border-line bg-surface p-4">
                <span className="flex size-10 items-center justify-center rounded-md bg-primary-soft">
                  <TrendingUp className="size-5 text-primary-strong" />
                </span>
                <div>
                  <p className="text-sm font-bold">Quiz passed - +15 pts</p>
                  <p className="text-xs text-ink-faint">Spotting AI mistakes · 92%</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ===== Social proof ===== */}
        <section className="border-y border-line bg-band">
          <div className="mx-auto flex page-container flex-wrap items-center justify-center gap-x-10 gap-y-2 px-4 py-5 text-center sm:px-6">
            <p className="text-sm font-medium text-ink-muted">
              Learners from <strong className="text-ink">23 organisations</strong>
            </p>
            <p className="hidden items-center gap-2 text-sm font-medium text-ink-faint sm:flex">
              <Award className="size-4 text-streak" aria-hidden="true" />
              Founding member badge for the first 25 from each organisation
            </p>
          </div>
        </section>

        {/* ===== Discovery: trending, newest, free starters ===== */}
        <DiscoverySections />

        {/* ===== Latest in AI: short article updates ===== */}
        <LatestUpdates />

        {/* ===== Browse by topic ===== */}
        <BrowseTopics />

        {/* ===== How it works - desktop only, keeps the mobile page short ===== */}
        <div className="hidden border-y border-line bg-band sm:block">
          <HowItWorks />
        </div>

        {/* ===== Features ===== */}
        {/* Desktop only - the value props duplicate what the hero already says. */}
        <section
          aria-labelledby="features-heading"
          className="mx-auto hidden page-container px-4 py-12 sm:block sm:px-6 sm:py-16"
        >
          <h2 id="features-heading" className="text-center text-2xl sm:text-3xl">
            Built for busy people, not bootcamps
          </h2>
          <ul className="mt-7 grid gap-3 sm:mt-10 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <li
                key={title}
                className="flex h-full items-start gap-3 rounded-card border border-line bg-surface p-4 sm:flex-col sm:gap-0 sm:p-6"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-soft sm:size-11">
                  <Icon className="size-5 text-primary-strong sm:size-6" aria-hidden="true" />
                </span>
                <div className="min-w-0 sm:mt-4">
                  <h3 className="font-display text-base sm:text-lg">{title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-ink-muted sm:mt-2 sm:text-base">
                    {body}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* ===== Services ===== */}
        <section aria-labelledby="services-heading" className="border-t border-line bg-band">
          <div className="mx-auto page-container px-4 py-12 sm:px-6 sm:py-16">
            <h2 id="services-heading" className="text-center text-2xl sm:text-3xl">
              Work with the people behind the platform
            </h2>
            <div className="mx-auto mt-10 grid max-w-5xl gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {/* Corporate workshops */}
              <div className="flex flex-col rounded-card border border-line bg-surface p-6 shadow-xs">
                <h3 className="font-display text-lg font-semibold">Corporate workshops</h3>
                <p className="mt-4 flex-1 text-sm text-ink-muted">
                  AI literacy, responsible AI and digital transformation for your whole team.
                </p>
                <p className="mt-4 font-display text-2xl font-semibold">$12&ndash;25k</p>
                <Link
                  href="/services/workshops"
                  className="mt-6 inline-flex min-h-12 items-center justify-center rounded-md border border-line font-semibold hover:border-primary hover:text-primary-strong"
                >
                  Learn more
                </Link>
              </div>
              {/* AI advisory */}
              <div className="flex flex-col rounded-card border border-line bg-surface p-6 shadow-xs">
                <h3 className="font-display text-lg font-semibold">AI advisory</h3>
                <p className="mt-4 flex-1 text-sm text-ink-muted">
                  Strategy and hard decisions with two AI PhDs, without hiring a team.
                </p>
                <p className="mt-4 font-display text-2xl font-semibold">$20&ndash;60k</p>
                <Link
                  href="/services/advisory"
                  className="mt-6 inline-flex min-h-12 items-center justify-center rounded-md border border-line font-semibold hover:border-primary hover:text-primary-strong"
                >
                  Learn more
                </Link>
              </div>
              {/* AI Pilot Sprint */}
              <div className="flex flex-col rounded-card border border-line bg-surface p-6 shadow-xs">
                <h3 className="font-display text-lg font-semibold">AI Pilot Sprint</h3>
                <p className="mt-4 flex-1 text-sm text-ink-muted">
                  A fixed-scope working pilot in 2&ndash;4 weeks.
                </p>
                <p className="mt-4 font-display text-2xl font-semibold">$25&ndash;40k</p>
                <Link
                  href="/services/pilot-sprint"
                  className="mt-6 inline-flex min-h-12 items-center justify-center rounded-md border border-line font-semibold hover:border-primary hover:text-primary-strong"
                >
                  Learn more
                </Link>
              </div>
              {/* 1:1 training */}
              <div className="flex flex-col rounded-card border border-line bg-surface p-6 shadow-xs">
                <h3 className="font-display text-lg font-semibold">1:1 training</h3>
                <p className="mt-4 flex-1 text-sm text-ink-muted">
                  Personal AI and software development coaching, basic to advanced tracks.
                </p>
                <p className="mt-4 font-display text-2xl font-semibold">from $90/hr</p>
                <Link
                  href="/services/training"
                  className="mt-6 inline-flex min-h-12 items-center justify-center rounded-md border border-line font-semibold hover:border-primary hover:text-primary-strong"
                >
                  Learn more
                </Link>
              </div>
            </div>
            <div className="mt-10 text-center">
              <Link
                href="/enquiry?service=team_platform"
                className="inline-flex min-h-12 items-center justify-center rounded-md bg-primary px-7 font-semibold text-on-primary transition-colors hover:bg-primary-strong"
              >
                Talk to us about your team
              </Link>
            </div>
          </div>
        </section>

        {/* ===== Final CTA ===== */}
        <section className="mx-auto page-container px-4 py-12 text-center sm:px-6 sm:py-16">
          <h2 className="text-2xl sm:text-3xl">Five minutes today. Genuinely good at AI by next month.</h2>
          <p className="mx-auto mt-3 max-w-md text-ink-muted sm:text-lg">
            Your first episode takes five minutes.
          </p>
          <Link
            href="/signup"
            className="mt-6 inline-flex min-h-13 items-center gap-2 rounded-md bg-primary px-8 text-lg font-semibold text-on-primary transition-colors hover:bg-primary-strong"
          >
            <Play className="size-5 fill-current" aria-hidden="true" />
            Start learning free
          </Link>
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
            <Link href="/services/workshops" className="hover:text-ink">
              Workshops
            </Link>
            <Link href="/services/advisory" className="hover:text-ink">
              Advisory
            </Link>
            <Link href="/services/pilot-sprint" className="hover:text-ink">
              Pilot Sprint
            </Link>
            <Link href="/services/training" className="hover:text-ink">
              1:1 training
            </Link>
            <Link href="/enquiry" className="hover:text-ink">
              Enquire
            </Link>
            <Link href="/privacy" className="hover:text-ink">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-ink">
              Terms
            </Link>
            <Link href="/login" className="hover:text-ink">
              Log in
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
