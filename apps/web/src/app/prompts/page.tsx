import type { Metadata } from "next";
import { PromptsClient } from "@/app/prompts/prompts-client";
import { getCurrentUser, getPrompts } from "@/lib/data-source";

export const metadata: Metadata = {
  title: "Prompts · Learn AI",
};

/**
 * `/prompts` — prompt library (LEARN_AI_V1_BUILD_SPEC.md §12 T16): vertical
 * filter, copy-to-clipboard, 10 free / rest Premium gated for free users.
 */
export default async function PromptsPage() {
  const [prompts, user] = await Promise.all([getPrompts(), getCurrentUser()]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="mb-6">
        <h1 className="font-heading text-2xl font-semibold text-foreground sm:text-3xl">Prompt library</h1>
        <p className="mt-1 text-sm text-muted">Copy-and-paste prompts from every published technique.</p>
      </header>

      <PromptsClient prompts={prompts} isFree={user.tier === "free"} />
    </div>
  );
}
