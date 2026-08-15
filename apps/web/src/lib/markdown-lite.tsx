/**
 * A deliberately tiny markdown renderer for the daily brief's `body_md`
 * fields — not a general-purpose parser. Handles exactly what this
 * project's sample content (and the draft agent's §5.3 output shape) uses:
 * paragraphs, `**bold**` inline emphasis, numbered lists, and a single
 * fenced code block. Anything fancier belongs in a real markdown
 * dependency when one is actually needed.
 */
import type { ReactNode } from "react";

function renderInline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter((part) => part.length > 0);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    return <span key={index}>{part}</span>;
  });
}

const ORDERED_LIST_LINE = /^\d+\.\s+/;

/** Renders paragraphs, `**bold**`, and numbered lists — no code fences. */
export function Prose({ text, className }: { text: string; className?: string }) {
  const blocks = text
    .split(/\n\n+/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0);

  return (
    <div className={className}>
      {blocks.map((block, blockIndex) => {
        const lines = block.split("\n").filter((line) => line.trim().length > 0);
        const isOrderedList = lines.length > 0 && lines.every((line) => ORDERED_LIST_LINE.test(line));

        if (isOrderedList) {
          return (
            <ol key={blockIndex} className="list-decimal space-y-1.5 pl-5">
              {lines.map((line, lineIndex) => (
                <li key={lineIndex}>{renderInline(line.replace(ORDERED_LIST_LINE, ""))}</li>
              ))}
            </ol>
          );
        }

        return <p key={blockIndex}>{renderInline(block)}</p>;
      })}
    </div>
  );
}

/** Splits a fenced ``` code block out of markdown, returning the text before/after it. */
export function splitFencedBlock(md: string): { before: string; code: string | null; after: string } {
  const match = md.match(/```([\s\S]*?)```/);
  if (!match || match.index === undefined) {
    return { before: md, code: null, after: "" };
  }
  return {
    before: md.slice(0, match.index).trim(),
    code: (match[1] ?? "").trim(),
    after: md.slice(match.index + match[0].length).trim(),
  };
}
