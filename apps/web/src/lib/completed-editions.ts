/**
 * Which edition dates the sample user has "completed" — shared between the
 * daily brief's "Mark today done" button and `/archive`'s completion
 * ticks, backed by `usePersistedState` (localStorage) since there is no
 * `completions` table to write to in this UI-first phase.
 */
export const COMPLETED_EDITIONS_KEY = "learnai:completed-editions";

/** Everything except the most recent edition — matches the un-clicked "Mark today done" state on `/`. */
export function defaultCompletedEditionDates(allEditionDatesDesc: string[]): string[] {
  return allEditionDatesDesc.slice(1);
}
