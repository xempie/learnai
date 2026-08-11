import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DRAFT_SYSTEM_PROMPT } from "../prompts/draft-prompt.js";

// AGENTS.md/§5 + §12/T10: "§5.3 prompt ... use verbatim, same guard-test
// pattern T09 used" — see triage-prompt.spec.test.ts for the original. This
// independently re-extracts the fenced §5.3 block from the spec file at
// test time (never importing the TS constant into the extraction) and
// asserts byte-for-byte equality against `DRAFT_SYSTEM_PROMPT`, so any
// future edit to either the spec or the constant that lets them drift apart
// fails the suite immediately.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const specPath = path.resolve(__dirname, "../../../../LEARN_AI_V1_BUILD_SPEC.md");

function extractDraftPromptFromSpec(): string {
  const spec = readFileSync(specPath, "utf8");
  const sectionStart = spec.indexOf("### 5.3 Draft agent");
  if (sectionStart === -1) {
    throw new Error('Could not find "### 5.3 Draft agent" section in the spec file');
  }
  const sectionEnd = spec.indexOf("### 5.4 Editorial rules", sectionStart);
  const section = spec.slice(sectionStart, sectionEnd === -1 ? undefined : sectionEnd);

  const fenceMatch = /```\n([\s\S]*?)```/.exec(section);
  if (!fenceMatch || !fenceMatch[1]) {
    throw new Error("Could not find a fenced code block in the §5.3 section of the spec file");
  }
  // Strip exactly one trailing newline before the closing fence — the
  // opening fence's own regex already consumed the newline after ``` .
  return fenceMatch[1].replace(/\n$/, "");
}

describe("§5.3 draft system prompt — verbatim", () => {
  it("DRAFT_SYSTEM_PROMPT matches the fenced block in LEARN_AI_V1_BUILD_SPEC.md §5.3 exactly", () => {
    const fromSpec = extractDraftPromptFromSpec();
    expect(DRAFT_SYSTEM_PROMPT).toBe(fromSpec);
  });
});
