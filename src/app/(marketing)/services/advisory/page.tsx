import type { Metadata } from "next";
import { ServiceDetail, type ServiceSpec } from "@/components/services/service-detail";
import { ServiceShell } from "@/components/services/service-shell";

const spec: ServiceSpec = {
  eyebrow: "AI advisory",
  title: "Advisory",
  subtitle: "Strategy and hard decisions with two AI PhDs, without hiring a team.",
  price: "$20–60k",
  audience: "Executives, CTOs and transformation leads",
  outcome:
    "Decisions made: what to build, what to buy, what to ignore — with a defensible rationale.",
  format: [
    "Fixed-scope engagements, not open-ended retainers",
    "Direct access to the founders — no delivery team between you and the answer",
    "Covers strategy, vendor choice, responsible-AI posture and capability build",
    "Outcome priced, never time-and-materials",
  ],
  enquiryService: "advisory",
};

export const metadata: Metadata = {
  title: "Advisory",
  description: spec.subtitle,
};

export default function AdvisoryPage() {
  return (
    <ServiceShell eyebrow={spec.eyebrow} title={spec.title} subtitle={spec.subtitle}>
      <ServiceDetail spec={spec} />
    </ServiceShell>
  );
}
