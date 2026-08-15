"use client";

import { useEffect, useState, type ComponentType } from "react";
import { ClockIcon, CircleCheckBigIcon, FlameIcon, type IconProps, MailIcon, UsersIcon } from "@/components/icons";
import type { AdminMetrics, MetricPoint } from "@/lib/sample-data";
import { verticalLabel } from "@/lib/verticals";

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function formatShortDate(iso: string): string {
  return new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${iso}T00:00:00Z`),
  );
}

function Bone({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-control bg-line ${className ?? ""}`} />;
}

function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: ComponentType<IconProps>;
}) {
  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted">
        <Icon size={14} />
        {label}
      </div>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

function SignupsLineChart({ points }: { points: MetricPoint[] }) {
  const width = 600;
  const height = 160;
  const paddingX = 8;
  const bottom = height - 22;
  const top = 10;
  const values = points.map((point) => point.value);
  const max = Math.max(...values, 1);
  const stepX = points.length > 1 ? (width - paddingX * 2) / (points.length - 1) : 0;

  function x(index: number): number {
    return paddingX + index * stepX;
  }
  function y(value: number): number {
    return bottom - (value / max) * (bottom - top);
  }

  const pathD = points.map((point, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)},${y(point.value).toFixed(1)}`).join(" ");
  const gridFractions = [0, 0.25, 0.5, 0.75, 1];
  const first = points[0];
  const last = points[points.length - 1];

  if (!first || !last) return null;

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Signups per day, last 30 days. Ranges from ${Math.min(...values)} to ${max} per day, ending at ${last.value} on ${formatShortDate(last.date)}.`}
        className="w-full text-foreground"
      >
        {gridFractions.map((fraction) => {
          const gy = bottom - fraction * (bottom - top);
          return (
            <line
              key={fraction}
              x1={paddingX}
              x2={width - paddingX}
              y1={gy}
              y2={gy}
              className="stroke-line"
              strokeWidth={1}
            />
          );
        })}
        <path d={pathD} fill="none" className="stroke-primary" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={x(points.length - 1)} cy={y(last.value)} r={3} className="fill-primary" />
        <text x={x(points.length - 1)} y={y(last.value) - 8} textAnchor="end" className="fill-current text-[11px] font-medium">
          {last.value}
        </text>
      </svg>
      <div className="mt-1 flex justify-between text-[11px] text-muted">
        <span>{formatShortDate(first.date)}</span>
        <span>{formatShortDate(last.date)}</span>
      </div>
    </div>
  );
}

function CompletionsBarChart({ data }: { data: AdminMetrics["completionsByVertical"] }) {
  const max = Math.max(...data.map((entry) => entry.value), 1);

  return (
    <div
      role="img"
      aria-label={`Completions by vertical: ${data.map((entry) => `${verticalLabel(entry.vertical)} ${entry.value}`).join(", ")}.`}
      className="space-y-2.5"
    >
      {data.map((entry) => (
        <div key={entry.vertical} className="flex items-center gap-2">
          <span className="w-20 shrink-0 truncate text-xs text-muted">{verticalLabel(entry.vertical)}</span>
          <div className="h-4 flex-1 overflow-hidden rounded-control bg-line/60">
            <div className="h-4 rounded-control bg-primary transition-[width] duration-500" style={{ width: `${(entry.value / max) * 100}%` }} />
          </div>
          <span className="w-10 shrink-0 text-right text-xs font-medium tabular-nums text-foreground">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

export function MetricsDashboard({ metrics }: { metrics: AdminMetrics }) {
  // A short simulated load — there is no real network round trip against
  // sample data, but the spec calls for loading skeletons, and this is
  // where a `GET /admin/metrics` request would actually land.
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const timeout = setTimeout(() => setLoading(false), 450);
    return () => clearTimeout(timeout);
  }, []);

  const signups30d = sum(metrics.signupsPerDay.map((point) => point.value));
  const medianReviewMinutes = median(metrics.reviewTimeMinutesPerDay.map((point) => point.value));

  if (loading) {
    return (
      <div className="space-y-6 p-4 md:p-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="rounded-card border border-line bg-surface p-4">
              <Bone className="h-3 w-20" />
              <Bone className="mt-2 h-7 w-16" />
            </div>
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-card border border-line bg-surface p-4">
            <Bone className="mb-4 h-4 w-32" />
            <Bone className="h-40 w-full" />
          </div>
          <div className="rounded-card border border-line bg-surface p-4">
            <Bone className="mb-4 h-4 w-40" />
            <Bone className="h-40 w-full" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <header>
        <h2 className="font-heading text-lg font-semibold text-foreground">Metrics</h2>
        <p className="text-xs text-muted">Sample data — 30-day trailing window unless noted.</p>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiCard label="Signups (30d)" value={signups30d.toLocaleString("en-AU")} icon={UsersIcon} />
        <KpiCard label="Active streaks" value={metrics.activeStreaksCount.toLocaleString("en-AU")} icon={FlameIcon} />
        <KpiCard label="Completion rate" value={`${metrics.completionRatePct.toFixed(1)}%`} icon={CircleCheckBigIcon} />
        <KpiCard
          label="Median review time"
          value={`${medianReviewMinutes.toFixed(1)}m`}
          hint="Target: full edition < 5m"
          icon={ClockIcon}
        />
        <KpiCard
          label="Open rate"
          value={metrics.openRatePct === null ? "—" : `${metrics.openRatePct.toFixed(1)}%`}
          hint={metrics.openRatePct === null ? "Email subsystem not shipped yet" : undefined}
          icon={MailIcon}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-card border border-line bg-surface p-4">
          <h3 className="mb-3 text-sm font-semibold text-foreground">Signups per day</h3>
          <SignupsLineChart points={metrics.signupsPerDay} />
        </section>
        <section className="rounded-card border border-line bg-surface p-4">
          <h3 className="mb-3 text-sm font-semibold text-foreground">Completions by vertical</h3>
          <CompletionsBarChart data={metrics.completionsByVertical} />
        </section>
      </div>
    </div>
  );
}
