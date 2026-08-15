"use client";

import { useState } from "react";
import { CheckIcon } from "@/components/icons";

/**
 * Sample-only claim flow: the real mutation is `POST /org/:slug/claim`
 * (T06, `app/api/v1/org/[slug]/claim/route.ts`), which needs a signed-in
 * session cookie this sample-data demo doesn't have. This button commits
 * optimistically in local component state instead, same pattern as
 * `MarkDoneButton` on the daily brief.
 */
export function ClaimCta({ organisationName }: { organisationName: string }) {
  const [claimed, setClaimed] = useState(false);

  if (claimed) {
    return (
      <div className="flex items-center gap-2 rounded-card border border-success/30 bg-success/10 px-4 py-3 text-sm font-medium text-success">
        <CheckIcon size={16} />
        Claim request sent — a founder will review it shortly.
      </div>
    );
  }

  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <p className="mb-3 text-sm text-muted">
        No one has claimed {organisationName} yet. If you manage this organisation&apos;s membership,
        you can claim it.
      </p>
      <button
        type="button"
        onClick={() => setClaimed(true)}
        className="cursor-pointer rounded-control bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors duration-200 hover:bg-primary-hover"
      >
        Claim this cohort
      </button>
    </div>
  );
}
