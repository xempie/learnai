import type { Metadata } from "next";
import { OrgView } from "@/components/org-view";

export const metadata: Metadata = { title: "Cohort" };

export default function OrgPage() {
  return <OrgView />;
}
