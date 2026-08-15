"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { CheckIcon, LogOutIcon } from "@/components/icons";
import { ThemeToggle } from "@/components/theme-toggle";
import type { SendCadence, UserPreferences, Vertical } from "@/lib/sample-data";
import { usePersistedState } from "@/lib/use-persisted-state";
import { VERTICALS, verticalLabel } from "@/lib/verticals";

const STORAGE_KEY = "learnai:preferences";
const CADENCE_OPTIONS: { value: SendCadence; label: string; hint: string }[] = [
  { value: "daily", label: "Daily", hint: "Every publishing day" },
  { value: "weekly", label: "Weekly", hint: "One digest a week" },
  { value: "none", label: "None", hint: "No email, browse the site instead" },
];

function formatHour(hour: number): string {
  const period = hour < 12 ? "am" : "pm";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}:00 ${period}`;
}

/**
 * Optimistic preference editor — same pattern as `MarkDoneButton`: every
 * control writes straight through to persisted (`localStorage`) sample
 * state via `usePersistedState`, since `PATCH /me/preferences` has
 * nothing to write to in this sample-data-only build phase. "Save" is a
 * confirmatory action on top of that — it re-commits the current values
 * and shows success feedback, rather than gating persistence behind it.
 */
export function PreferencesForm({ initial }: { initial: UserPreferences }) {
  const [draft, setDraft] = usePersistedState<UserPreferences>(STORAGE_KEY, initial);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");

  const activeVerticals: Vertical[] = draft.verticals.length === 0 ? VERTICALS : draft.verticals;

  function toggleVertical(vertical: Vertical): void {
    const current = draft.verticals.length === 0 ? [...VERTICALS] : draft.verticals;
    const next = current.includes(vertical) ? current.filter((v) => v !== vertical) : [...current, vertical];
    // Selecting everything collapses back to `[]`, matching the "empty = all" convention (§3.2).
    setDraft({ ...draft, verticals: next.length === VERTICALS.length ? [] : next });
  }

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setStatus("saving");
    await new Promise((resolve) => setTimeout(resolve, 450));
    setDraft(draft);
    setStatus("saved");
    setTimeout(() => setStatus("idle"), 2500);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-foreground">Email cadence</legend>
        <div className="space-y-2">
          {CADENCE_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={`flex cursor-pointer items-center gap-3 rounded-control border px-3 py-2.5 transition-colors duration-200 ${
                draft.cadence === option.value ? "border-primary" : "border-line"
              }`}
            >
              <input
                type="radio"
                name="cadence"
                value={option.value}
                checked={draft.cadence === option.value}
                onChange={() => setDraft({ ...draft, cadence: option.value })}
                className="h-4 w-4 shrink-0 accent-[var(--primary)]"
              />
              <span>
                <span className="block text-sm font-medium text-foreground">{option.label}</span>
                <span className="block text-xs text-muted">{option.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="send-hour" className="mb-1.5 block text-sm font-semibold text-foreground">
          Send time
        </label>
        <select
          id="send-hour"
          value={draft.sendHourLocal}
          onChange={(event) => setDraft({ ...draft, sendHourLocal: Number(event.target.value) })}
          disabled={draft.cadence === "none"}
          className="w-full cursor-pointer rounded-control border border-line bg-surface px-3 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
        >
          {Array.from({ length: 24 }, (_, hour) => (
            <option key={hour} value={hour}>
              {formatHour(hour)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <span id="verticals-label" className="mb-2 block text-sm font-semibold text-foreground">
          Verticals
        </span>
        <div role="group" aria-labelledby="verticals-label" className="flex flex-wrap gap-2">
          {VERTICALS.map((vertical) => {
            const active = activeVerticals.includes(vertical);
            return (
              <button
                key={vertical}
                type="button"
                aria-pressed={active}
                onClick={() => toggleVertical(vertical)}
                className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm font-medium transition-colors duration-200 ${
                  active
                    ? "border-primary bg-primary text-on-primary"
                    : "border-line bg-surface text-muted hover:border-primary hover:text-primary"
                }`}
              >
                {verticalLabel(vertical)}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-xs text-muted">All selected means every vertical, including new ones.</p>
      </div>

      <div className="flex items-center justify-between rounded-control border border-line bg-surface px-3 py-2.5">
        <label htmlFor="push-toggle" className="text-sm font-medium text-foreground">
          Push notifications
        </label>
        <button
          id="push-toggle"
          type="button"
          role="switch"
          aria-checked={draft.pushEnabled}
          onClick={() => setDraft({ ...draft, pushEnabled: !draft.pushEnabled })}
          className={`relative h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ${
            draft.pushEnabled ? "bg-primary" : "bg-line"
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
              draft.pushEnabled ? "translate-x-5" : ""
            }`}
          />
        </button>
      </div>

      <div className="flex items-center justify-between rounded-control border border-line bg-surface px-3 py-2.5">
        <span className="text-sm font-medium text-foreground">Theme</span>
        <ThemeToggle />
      </div>

      <div>
        <button
          type="submit"
          disabled={status === "saving"}
          className="w-full cursor-pointer rounded-control bg-primary px-4 py-3 text-sm font-semibold text-on-primary transition-colors duration-200 hover:bg-primary-hover disabled:cursor-default disabled:opacity-70"
        >
          {status === "saving" ? "Saving…" : "Save preferences"}
        </button>
        <p role="status" aria-live="polite" className="mt-2 h-5 text-sm font-medium text-success">
          {status === "saved" && (
            <span className="inline-flex items-center gap-1.5">
              <CheckIcon size={14} />
              Preferences saved
            </span>
          )}
        </p>
      </div>

      <Link
        href="/signin"
        className="flex cursor-pointer items-center gap-2 rounded-control border border-line bg-surface px-4 py-3 text-sm font-medium text-danger transition-colors duration-200 hover:bg-danger/5"
      >
        <LogOutIcon size={16} />
        Sign out
      </Link>
    </form>
  );
}
