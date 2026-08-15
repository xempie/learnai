import { CalendarDaysIcon } from "@/components/icons";

/**
 * `/archive` — placeholder nav target for Phase 1's app shell. The
 * archive listing (past editions, backed by `getEditions()` in
 * `lib/data-source.ts`) is a later-phase build; this keeps the shell's
 * nav link from 404ing in the meantime.
 */
export default function ArchivePage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <div className="rounded-card border border-dashed border-line bg-surface p-8 text-center">
        <CalendarDaysIcon size={28} className="mx-auto mb-3 text-muted" />
        <h1 className="font-heading text-xl font-semibold text-foreground">Archive coming soon</h1>
        <p className="mt-1 text-sm text-muted">Past editions will live here.</p>
      </div>
    </div>
  );
}
