import type { Metadata } from "next";
import { OnboardingFlow } from "@/components/onboarding-flow";

export const metadata: Metadata = { title: "Set up your profile" };

export default function OnboardingPage() {
  return <OnboardingFlow />;
}
