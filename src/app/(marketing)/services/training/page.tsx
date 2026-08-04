import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";
import { BookingEmbed } from "@/components/services/booking-embed";
import { ServiceShell } from "@/components/services/service-shell";

const RATE_LADDER = [
  { tier: "Students & individual learners", rate: "$90–120/hr" },
  { tier: "Professionals upskilling", rate: "$150–220/hr" },
  { tier: "Senior engineers & tech leads", rate: "$250–350/hr" },
  { tier: "Executive 1:1 briefing", rate: "$350+/hr" },
] as const;

const TRACKS = [
  { name: "AI Foundations", prerequisite: "None", sessions: 2 },
  { name: "Prompt Engineering", prerequisite: "AI Foundations or equivalent", sessions: 2 },
  { name: "Python for AI", prerequisite: "Basic programming", sessions: 4 },
  { name: "Building with LLM APIs", prerequisite: "Python", sessions: 4 },
  { name: "Agentic Workflows", prerequisite: "LLM APIs", sessions: 3 },
  { name: "Software Development Fundamentals", prerequisite: "None", sessions: 5 },
  { name: "Cloud & AWS Basics", prerequisite: "Software fundamentals", sessions: 3 },
] as const;

const BOOKING_BULLETS = [
  "Packages, not loose hours — booked and paid upfront",
  "24-hour cancellation notice, otherwise the session is forfeited",
  "Limited weekly slots — capped deliberately",
] as const;

export const metadata: Metadata = {
  title: "1:1 training",
  description:
    "Personal AI and software development coaching, sold as packages of 1–5 sessions, paid upfront.",
};

export default function TrainingPage() {
  return (
    <ServiceShell
      eyebrow="1:1 training"
      title="Personal AI and software development coaching"
      subtitle="One-on-one sessions across seven tracks, sold as packages of 1–5 sessions and paid upfront."
    >
      <div className="flex flex-col gap-10">
        {/* ===== Rate ladder ===== */}
        <div>
          <h2 className="text-xl font-semibold">Rates</h2>
          <div className="mt-4 overflow-x-auto rounded-card border border-line">
            <table className="w-full min-w-[480px] text-left">
              <thead>
                <tr className="border-b border-line bg-band">
                  <th className="px-6 py-3 text-sm font-medium tracking-[0.08em] text-ink-faint uppercase">
                    Tier
                  </th>
                  <th className="px-6 py-3 text-sm font-medium tracking-[0.08em] text-ink-faint uppercase">
                    Rate
                  </th>
                </tr>
              </thead>
              <tbody>
                {RATE_LADDER.map((row) => (
                  <tr key={row.tier} className="border-b border-line last:border-b-0">
                    <td className="px-6 py-4 text-ink-muted">{row.tier}</td>
                    <td className="px-6 py-4 font-display font-semibold">{row.rate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ===== Tracks ===== */}
        <div>
          <h2 className="text-xl font-semibold">Tracks</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {TRACKS.map((track) => (
              <div key={track.name} className="rounded-card border border-line bg-surface p-6">
                <h3 className="font-display text-lg font-semibold">{track.name}</h3>
                <dl className="mt-3 flex flex-col gap-1 text-sm text-ink-muted">
                  <div className="flex gap-2">
                    <dt className="font-medium text-ink-faint">Prerequisite:</dt>
                    <dd>{track.prerequisite}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="font-medium text-ink-faint">Sessions:</dt>
                    <dd>{track.sessions}</dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>
        </div>

        {/* ===== How booking works ===== */}
        <div>
          <h2 className="text-xl font-semibold">How booking works</h2>
          <ul className="mt-4 flex flex-col gap-3">
            {BOOKING_BULLETS.map((item) => (
              <li key={item} className="flex items-start gap-3 text-ink-muted">
                <Check className="mt-1 size-4 shrink-0 text-primary-strong" aria-hidden="true" />
                <span>{item}</span>
              </li>
            ))}
            <li className="flex items-start gap-3 text-ink-muted">
              <Check className="mt-1 size-4 shrink-0 text-primary-strong" aria-hidden="true" />
              <span>
                Booking for a team? That&rsquo;s a workshop —{" "}
                <Link href="/enquiry?service=workshop" className="font-semibold text-primary-strong hover:underline">
                  tell us here
                </Link>
                .
              </span>
            </li>
          </ul>
        </div>

        {/* ===== Booking embed ===== */}
        <div>
          <h2 className="text-xl font-semibold">Book a session</h2>
          <div className="mt-4">
            <BookingEmbed />
          </div>
        </div>
      </div>
    </ServiceShell>
  );
}
