import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TRIAGE_SYSTEM_PROMPT } from "../prompts/triage-prompt.js";

// AGENTS.md/§5: "Anything marked NON-NEGOTIABLE in the spec must not be
// altered, deferred, or stubbed without explicit founder approval" and
// §5.2's system prompt is marked "use verbatim; changes require founder
// approval". This test is the enforcement mechanism: it independently
// re-extracts the fenced prompt block from the spec file at test time
// (never importing the TS constant into the extraction) and asserts
// byte-for-byte equality against `TRIAGE_SYSTEM_PROMPT` — so any future
// edit to either the spec or the constant that lets them drift apart
// fails the suite immediately.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const specPath = path.resolve(__dirname, "../../../../LEARN_AI_V1_BUILD_SPEC.md");

function extractTriagePromptFromSpec(): string {
  const spec = readFileSync(specPath, "utf8");
  const sectionStart = spec.indexOf("### 5.2 Triage agent");
  if (sectionStart === -1) {
    throw new Error('Could not find "### 5.2 Triage agent" section in the spec file');
  }
  const sectionEnd = spec.indexOf("### 5.3 Draft agent", sectionStart);
  const section = spec.slice(sectionStart, sectionEnd === -1 ? undefined : sectionEnd);

  const fenceMatch = /```\n([\s\S]*?)```/.exec(section);
  if (!fenceMatch || !fenceMatch[1]) {
    throw new Error("Could not find a fenced code block in the §5.2 section of the spec file");
  }
  // Strip exactly one trailing newline before the closing fence — the
  // opening fence's own regex already consumed the newline after ``` .
  return fenceMatch[1].replace(/\n$/, "");
}

describe("§5.2 triage system prompt — verbatim", () => {
  it("TRIAGE_SYSTEM_PROMPT matches the fenced block in LEARN_AI_V1_BUILD_SPEC.md §5.2 exactly", () => {
    const fromSpec = extractTriagePromptFromSpec();
    expect(TRIAGE_SYSTEM_PROMPT).toBe(fromSpec);
  });
});
