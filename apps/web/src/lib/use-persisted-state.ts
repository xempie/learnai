"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * `useState` that reads/writes a JSON value to `localStorage`. This is the
 * UI-Phase-2 stand-in for "preferences in sample state" (there is no
 * backend to PATCH `/me/preferences` against yet) — vertical filter chips
 * on `/archive` and `/prompts`, and the `/me` preference controls, all use
 * this so a choice survives a reload within the same browser.
 *
 * Built on `useSyncExternalStore` (the same pattern `ThemeToggle` uses for
 * its own localStorage-backed value) rather than `useState` + a mount
 * effect — reading storage inside an effect and then calling `setState`
 * synchronously is exactly the cascading-render anti-pattern
 * `react-hooks/set-state-in-effect` flags. `getServerSnapshot` returns
 * `null` (server has no `localStorage`), so the first client render before
 * hydration matches the server-rendered markup; the *next* paint (still
 * before the browser shows anything, since this all happens during the
 * same commit) picks up the real stored value.
 */

type Listener = () => void;
const listenersByKey = new Map<string, Set<Listener>>();

function notify(key: string): void {
  for (const listener of listenersByKey.get(key) ?? []) listener();
}

export function usePersistedState<T>(key: string, initial: T): [T, (value: T) => void] {
  const subscribe = useCallback(
    (onStoreChange: Listener) => {
      let set = listenersByKey.get(key);
      if (!set) {
        set = new Set();
        listenersByKey.set(key, set);
      }
      set.add(onStoreChange);

      function onStorageEvent(event: StorageEvent): void {
        if (event.key === key) onStoreChange();
      }
      window.addEventListener("storage", onStorageEvent);

      return () => {
        set?.delete(onStoreChange);
        window.removeEventListener("storage", onStorageEvent);
      };
    },
    [key],
  );

  const getSnapshot = useCallback((): string | null => {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }, [key]);

  const getServerSnapshot = useCallback((): string | null => null, []);

  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  let value = initial;
  if (raw !== null) {
    try {
      value = JSON.parse(raw) as T;
    } catch {
      // Corrupt stored value — fall back to the initial value.
    }
  }

  const setValue = useCallback(
    (next: T) => {
      try {
        window.localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // Storage unavailable (private browsing, quota) — nothing persists,
        // but there's also nothing more this hook can do about it.
      }
      notify(key);
    },
    [key],
  );

  return [value, setValue];
}
