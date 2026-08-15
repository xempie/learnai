"use client";

import { useSyncExternalStore } from "react";
import { MoonIcon, SunIcon } from "@/components/icons";

type Theme = "light" | "dark";

const STORAGE_KEY = "learnai-theme";

function getSnapshot(): Theme {
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "dark" || attr === "light") return attr;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

// Server render has no DOM/matchMedia to read — "light" is an arbitrary but
// consistent placeholder. The anti-FOUC inline script in layout.tsx has
// already set the real `data-theme` on <html> before this ever paints, so
// the page itself never flashes; only this one icon briefly shows the
// placeholder state until useSyncExternalStore re-renders post-hydration
// with the real snapshot (`getSnapshot`, above).
function getServerSnapshot(): Theme {
  return "light";
}

function subscribe(onStoreChange: () => void): () => void {
  const observer = new MutationObserver(onStoreChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

/**
 * Reads/writes the same `data-theme` attribute + localStorage key the
 * anti-FOUC inline script (layout.tsx) initialises before hydration.
 * Uses `useSyncExternalStore` — rather than `useState` + a mount effect —
 * specifically so the browser-only theme value is read as an external
 * store subscription, not a synchronous `setState` inside an effect.
 */
export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const isDark = theme === "dark";

  function toggle() {
    const next: Theme = isDark ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-pressed={isDark}
      className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-control border border-line text-muted transition-colors duration-200 hover:border-primary hover:text-primary"
    >
      {isDark ? <SunIcon size={18} /> : <MoonIcon size={18} />}
    </button>
  );
}
