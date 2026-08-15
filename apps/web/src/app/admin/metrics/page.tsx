import type { Metadata } from "next";
import { MetricsDashboard } from "@/app/admin/metrics/metrics-dashboard";
import { getAdminMetrics } from "@/lib/data-source";

export const metadata: Metadata = {
  title: "Metrics · Learn AI Admin",
};

/**
 * `/admin/metrics` — LEARN_AI_V1_BUILD_SPEC.md §8 `GET /admin/metrics` KPI
 * dashboard, against sample data. Server component fetches; `MetricsDashboard`
 * (client) owns the brief simulated-loading skeleton and the two inline-SVG
 * charts (no chart library, per the admin design-system override).
 */
export default async function AdminMetricsPage() {
  const metrics = await getAdminMetrics();

  return <MetricsDashboard metrics={metrics} />;
}
