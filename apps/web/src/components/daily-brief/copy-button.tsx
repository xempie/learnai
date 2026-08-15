"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon } from "@/components/icons";

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard API can be unavailable (permissions, insecure context in
      // some embedded webviews) — the button still reports failure quietly
      // rather than throwing, since copying the prompt is a convenience,
      // not a required action.
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex cursor-pointer items-center gap-1.5 rounded-control border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-muted transition-colors duration-200 hover:border-primary hover:text-primary"
      aria-label="Copy prompt to clipboard"
    >
      {copied ? <CheckIcon size={14} className="text-success" /> : <CopyIcon size={14} />}
      {copied ? "Copied" : "Copy prompt"}
    </button>
  );
}
