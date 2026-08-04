import type { Metadata } from "next";
import { ServiceDetail, type ServiceSpec } from "@/components/services/service-detail";
import { ServiceShell } from "@/components/services/service-shell";

const spec: ServiceSpec = {
  eyebrow: "Corporate workshops",
  title: "Workshops",
  subtitle: "AI literacy, responsible AI and digital transformation for your whole team.",
  price: "$12–25k per engagement",
  audience: "L&D, HR and innovation leads",
  outcome:
    "A team that uses AI competently and can say why — with aggregate evidence of who has been trained and on what.",
  format: [
    "AI literacy, responsible AI, or digital transformation — scoped to your industry",
    "Half-day to two-day formats, on site or remote",
    "Built and delivered by two AI PhDs, not a slide pack",
    "Every session ends with an agreed next step, not a feedback form",
  ],
  enquiryService: "workshop",
};

export const metadata: Metadata = {
  title: "Workshops",
  description: spec.subtitle,
};

export default function WorkshopsPage() {
  return (
    <ServiceShell eyebrow={spec.eyebrow} title={spec.title} subtitle={spec.subtitle}>
      <ServiceDetail spec={spec} />
    </ServiceShell>
  );
}
