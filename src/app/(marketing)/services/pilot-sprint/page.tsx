import type { Metadata } from "next";
import { ServiceDetail, type ServiceSpec } from "@/components/services/service-detail";
import { ServiceShell } from "@/components/services/service-shell";

const spec: ServiceSpec = {
  eyebrow: "AI Pilot Sprint",
  title: "Pilot Sprint",
  subtitle: "A fixed-scope working pilot in 2–4 weeks.",
  price: "$25–40k fixed",
  audience: "CTOs and product owners",
  outcome:
    "A working pilot in production-adjacent shape, in 2–4 weeks, with a written go/no-go recommendation.",
  format: [
    "Fixed scope agreed up front, change-controlled",
    "2–4 weeks, end to end",
    "You keep the code and the findings",
    "Priced on the outcome, not the hours",
  ],
  enquiryService: "pilot_sprint",
};

export const metadata: Metadata = {
  title: "Pilot Sprint",
  description: spec.subtitle,
};

export default function PilotSprintPage() {
  return (
    <ServiceShell eyebrow={spec.eyebrow} title={spec.title} subtitle={spec.subtitle}>
      <ServiceDetail spec={spec} />
    </ServiceShell>
  );
}
