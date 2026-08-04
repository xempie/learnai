import type { Metadata } from "next";
import { EnquiryForm } from "@/components/services/enquiry-form";
import { ServiceShell } from "@/components/services/service-shell";
import type { ServiceInterest } from "@/lib/leads";
import { SERVICE_INTERESTS } from "@/lib/leads";

export const metadata: Metadata = {
  title: "Talk to us about your team",
  description: "Workshops, advisory, pilot sprints and training — tell us what you need.",
};

export default async function EnquiryPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string | string[] }>;
}) {
  const { service } = await searchParams;
  const preset = (Array.isArray(service) ? service[0] : service) as ServiceInterest | undefined;
  const defaultService =
    preset && (SERVICE_INTERESTS as readonly string[]).includes(preset) ? preset : undefined;
  return (
    <ServiceShell
      eyebrow="Enquiries"
      title="Talk to us about your team"
      subtitle="Tell us what you're trying to do. We reply within one business day."
    >
      <EnquiryForm defaultService={defaultService} />
    </ServiceShell>
  );
}
