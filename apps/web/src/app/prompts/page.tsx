import { MessageSquareIcon } from "@/components/icons";

/**
 * `/prompts` — placeholder nav target for Phase 1's app shell. The prompt
 * library (backed by `getPrompts()` in `lib/data-source.ts`) is a
 * later-phase build; this keeps the shell's nav link from 404ing.
 */
export default function PromptsPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <div className="rounded-card border border-dashed border-line bg-surface p-8 text-center">
        <MessageSquareIcon size={28} className="mx-auto mb-3 text-muted" />
        <h1 className="font-heading text-xl font-semibold text-foreground">Prompt library coming soon</h1>
        <p className="mt-1 text-sm text-muted">Free and premium prompts will live here.</p>
      </div>
    </div>
  );
}
