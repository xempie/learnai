import type { ReactNode } from "react";

/**
 * Deliberately tiny, dependency-free markdown renderer.
 *
 * Spec §4.3 forbids raw HTML in content bodies. This implementation is
 * structurally incapable of injecting it: every output is a real React
 * element and the source string is only ever placed into text nodes.
 * There is no `dangerouslySetInnerHTML` anywhere in this file, and no
 * third-party parser that could grow one.
 *
 * Supported subset: `### heading`, `**bold**`, `*italic*`, `- ` bullet
 * lists, and blank-line separated paragraphs. Anything else renders as
 * literal text.
 */

const INLINE_PATTERN = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;

/** Split a run of text into plain strings, <strong> and <em> nodes. */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const parts = text.split(INLINE_PATTERN).filter((p) => p !== "");

  return parts.map((part, i) => {
    const key = `${keyPrefix}-i${i}`;

    if (part.length > 4 && part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={key} className="font-semibold text-ink">
          {part.slice(2, -2)}
        </strong>
      );
    }

    if (part.length > 2 && part.startsWith("*") && part.endsWith("*")) {
      return <em key={key}>{part.slice(1, -1)}</em>;
    }

    return <span key={key}>{part}</span>;
  });
}

export function MarkdownBody({
  source,
  className = "",
}: {
  source: string;
  className?: string;
}) {
  const blocks = source
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);

  return (
    <div className={`text-ink-muted leading-relaxed ${className}`}>
      {blocks.map((block, bi) => {
        const key = `b${bi}`;
        const lines = block.split("\n").map((l) => l.trim());

        // Heading: "### Some heading"
        if (block.startsWith("### ")) {
          return (
            <h3 key={key} className="mt-6 text-lg font-semibold text-ink first:mt-0">
              {renderInline(block.slice(4).trim(), key)}
            </h3>
          );
        }

        // Bullet list: every non-empty line begins with "- "
        if (lines.every((l) => l.startsWith("- "))) {
          return (
            <ul key={key} className="mt-4 list-disc space-y-2 pl-5">
              {lines.map((line, li) => (
                <li key={`${key}-l${li}`}>{renderInline(line.slice(2).trim(), `${key}-l${li}`)}</li>
              ))}
            </ul>
          );
        }

        // Paragraph - single newlines inside a block become spaces.
        return (
          <p key={key} className="mt-4 first:mt-0">
            {renderInline(lines.join(" "), key)}
          </p>
        );
      })}
    </div>
  );
}
