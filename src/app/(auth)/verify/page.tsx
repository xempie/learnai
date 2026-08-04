import type { Metadata } from "next";
import { VerifyEmailForm } from "@/components/verify-email-form";

export const metadata: Metadata = { title: "Verify your email" };

export default function VerifyPage() {
  return <VerifyEmailForm />;
}
