import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { VerifyClient } from "@/app/verify/verify-client";

export const metadata: Metadata = {
  title: "Verify your email · Learn AI",
};

export default function VerifyPage() {
  return (
    <Suspense
      fallback={
        <AuthCard title="Check your email">
          <div className="h-24 animate-pulse rounded-control bg-line" />
        </AuthCard>
      }
    >
      <VerifyClient />
    </Suspense>
  );
}
