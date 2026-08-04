"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { Cookie } from "lucide-react";

const STORAGE_KEY = "acadu:cookie-consent";

type Choice = "all" | "essential";

/**
 * The stored choice lives in localStorage, which is a client-only external
 * store - so it is read through useSyncExternalStore rather than in an effect.
 * The server snapshot is "pending", which renders nothing, so the static export
 * and the first hydration pass agree and the banner only appears afterwards.
 */
const PENDING = "pending";
const NONE = "none";

const listeners = new Set<() => void>();

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

function getSnapshot(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? NONE;
  } catch {
    /* storage blocked (private mode / cookies disabled) - ask again */
    return NONE;
  }
}

function getServerSnapshot(): string {
  return PENDING;
}

export function CookieConsent() {
  const consent = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function choose(choice: Choice) {
    try {
      window.localStorage.setItem(STORAGE_KEY, choice);
    } catch {
      /* nothing to persist to - dismissing still works for this session */
    }
    listeners.forEach((notify) => notify());
  }

  // Not mounted yet, or a choice has already been made.
  if (consent !== NONE) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      className="fixed inset-x-4 bottom-16 z-40 mx-auto max-w-2xl rounded-card border border-line bg-surface p-5 shadow-lg lg:bottom-4"
    >
      <div className="flex items-start gap-3">
        <span className="hidden size-10 shrink-0 items-center justify-center rounded-md bg-primary-soft sm:flex">
          <Cookie className="size-5 text-primary-strong" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="font-display font-semibold">Cookies on this site</p>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
            Essential cookies keep you signed in and are always on. Analytics cookies are optional
            - they tell us which episodes people finish and which ones they abandon, which is how we
            decide what to make next. They are never used to build an advertising profile.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => choose("all")}
              className="inline-flex min-h-12 items-center rounded-md bg-primary px-6 font-semibold text-on-primary transition-colors hover:bg-primary-strong"
            >
              Accept all
            </button>
            <button
              type="button"
              onClick={() => choose("essential")}
              className="inline-flex min-h-12 items-center rounded-md border border-line px-4 font-semibold text-ink transition-colors hover:border-primary hover:text-primary-strong"
            >
              Essential only
            </button>
            <Link
              href="/privacy"
              className="inline-flex min-h-12 items-center px-2 text-sm font-semibold text-primary-strong hover:underline"
            >
              Cookie policy
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
