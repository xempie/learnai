"use client";

import { useEffect, useRef } from "react";
import { SparklesIcon, XIcon } from "@/components/icons";

/**
 * Sample-only upgrade prompt (Stripe/payments is explicitly out of scope
 * for V1 — LEARN_AI_V1_BUILD_SPEC.md §13) shown when a free user taps a
 * premium prompt or a locked archive edition. Bottom sheet on mobile,
 * centred dialog on larger screens.
 */
export function UpgradeSheet({
  open,
  onClose,
  reason,
}: {
  open: boolean;
  onClose: () => void;
  reason?: string;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upgrade-sheet-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-t-card border border-line bg-surface p-6 shadow-xl sm:rounded-card"
        style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-accent/10 text-accent">
            <SparklesIcon size={20} />
          </span>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="cursor-pointer rounded-control p-1.5 text-muted transition-colors duration-200 hover:text-foreground"
          >
            <XIcon size={18} />
          </button>
        </div>
        <h2 id="upgrade-sheet-title" className="font-heading text-lg font-semibold text-foreground">
          Unlock Learn AI Premium
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          {reason ?? "This is part of Learn AI Premium."} Upgrade for the full prompt library, the
          complete archive, and every past edition.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full cursor-pointer rounded-control bg-primary px-4 py-3 text-sm font-semibold text-on-primary transition-colors duration-200 hover:bg-primary-hover"
        >
          See premium plans
        </button>
        <button
          type="button"
          onClick={onClose}
          className="mt-2 w-full cursor-pointer rounded-control px-4 py-2 text-sm font-medium text-muted transition-colors duration-200 hover:text-foreground"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
