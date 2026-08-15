"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeftIcon, LockIcon } from "@/components/icons";
import { UpgradeSheet } from "@/components/upgrade-sheet";
import { formatEditionDate } from "@/lib/format";

export function BriefLockedGate({ editionDate, headline }: { editionDate: string; headline: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <Link
        href="/archive"
        className="mb-6 inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-muted transition-colors duration-200 hover:text-primary"
      >
        <ArrowLeftIcon size={15} />
        Back to archive
      </Link>

      <div className="rounded-card border border-line bg-surface p-8 text-center">
        <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-accent">
          <LockIcon size={22} />
        </span>
        <p className="text-sm text-muted">{formatEditionDate(editionDate)}</p>
        <h1 className="mt-1 font-heading text-xl font-semibold text-foreground">{headline}</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          This edition is outside your free 7-day window. Upgrade to Learn AI Premium to read every
          past edition.
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-5 cursor-pointer rounded-control bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary transition-colors duration-200 hover:bg-primary-hover"
        >
          Upgrade to Premium
        </button>
      </div>

      <UpgradeSheet
        open={open}
        onClose={() => setOpen(false)}
        reason="This edition is outside your free 7-day archive window."
      />
    </div>
  );
}
