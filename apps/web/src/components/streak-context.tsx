"use client";

import { createContext, useContext } from "react";

/**
 * Lets the daily brief's "Mark today done" button (deep in page content)
 * bump the streak shown in the app shell's header badges (mobile masthead
 * + desktop top bar) without prop-drilling through every layout in
 * between. `AppShell` owns the actual state and provides `bump`.
 */
export const StreakBumpContext = createContext<() => void>(() => {});

export function useBumpStreak(): () => void {
  return useContext(StreakBumpContext);
}
