import Link from "next/link";
import {
  BadgeCheck,
  Clock3,
  GraduationCap,
  ShieldCheck,
  TrendingUp,
  Users,
} from "lucide-react";
import { BRAND } from "@/lib/brand";

const POINTS = [
  {
    icon: Clock3,
    title: "Five-minute episodes",
    text: "training that fits inside a working day instead of blocking one out.",
  },
  {
    icon: BadgeCheck,
    title: "Assessed, not just watched",
    text: "a short quiz after every episode, so completion means competence.",
  },
  {
    icon: Users,
    title: "Learn alongside colleagues",
    text: "your work email places you in your organisation's cohort automatically.",
  },
  {
    icon: TrendingUp,
    title: "Evidence for your records",
    text: "aggregate reporting on who has been trained and on what.",
  },
  {
    icon: ShieldCheck,
    title: "Private by default",
    text: "nobody sees you're learning unless you choose to appear.",
  },
];

/**
 * Split-screen auth chrome: brand panel on the left (desktop only),
 * form column on the right.
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh bg-band">
      {/* ===== Brand panel (desktop) ===== */}
      <aside className="relative hidden w-1/2 max-w-2xl flex-col justify-between overflow-hidden bg-gradient-to-br from-[#2e2e2e] via-[#242424] to-[#141414] p-10 text-white lg:flex">
        {/* Ambient glow */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-[#ff682c]/20 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-32 -left-12 size-80 rounded-full bg-[#816729]/25 blur-3xl"
        />

        <Link
          href="/"
          className="relative flex items-center gap-3 font-display text-2xl font-semibold"
        >
          <span className="flex size-11 items-center justify-center rounded-lg bg-white/15">
            <GraduationCap className="size-6" aria-hidden="true" />
          </span>
          {BRAND.name}
          <span className="border-l border-white/20 pl-3 text-sm font-normal leading-tight text-white/70">
            Workforce
            <br />
            AI literacy
          </span>
        </Link>

        <div className="relative">
          <h2 className="max-w-md text-3xl font-semibold leading-tight">
            Become the person your team asks about AI.
          </h2>
          <p className="mt-4 max-w-md text-white/70">
            Short, human-reviewed episodes that make your whole organisation confident with AI -
            and give you the record to prove it.
          </p>

          <ul className="mt-7 space-y-2.5">
            {POINTS.map(({ icon: Icon, title, text }) => (
              <li
                key={title}
                className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 backdrop-blur-sm"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-white/10">
                  <Icon className="size-4 text-[#ff682c]" aria-hidden="true" />
                </span>
                <span className="text-sm text-white/80">
                  <span className="font-semibold text-white">{title}:</span> {text}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-white/50">
          Every episode is reviewed by a human before it reaches a learner. Hosted in Australia.
        </p>
      </aside>

      {/* ===== Form column ===== */}
      <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-md">
          {/* Compact brand mark on small screens */}
          <Link
            href="/"
            className="mb-7 flex items-center gap-3 font-display text-xl font-semibold text-ink lg:hidden"
          >
            <span className="flex size-10 items-center justify-center rounded-md bg-primary text-on-primary">
              <GraduationCap className="size-5" aria-hidden="true" />
            </span>
            {BRAND.name}
            <span className="border-l border-line pl-3 text-xs font-normal leading-tight text-ink-faint">
              Workforce
              <br />
              AI literacy
            </span>
          </Link>

          {children}
        </div>
      </div>
    </div>
  );
}
