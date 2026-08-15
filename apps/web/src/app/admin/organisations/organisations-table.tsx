"use client";

import { useState } from "react";
import { CheckIcon } from "@/components/icons";
import type { Organisation } from "@/lib/sample-data";

/**
 * Dense inline-editable rename queue — sample-data mode, same "optimistic,
 * no backend to PATCH" pattern as `ClaimCta`/`MarkDoneButton`. The real
 * mutation is `PATCH /api/v1/admin/organisations/:id` (T06, exercised
 * directly by `route.test.ts`, unaffected by this page).
 */
export function OrganisationsTable({ organisations }: { organisations: Organisation[] }) {
  const [rows, setRows] = useState(organisations);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savedIds, setSavedIds] = useState<Record<string, boolean>>({});

  function isDirty(row: Organisation): boolean {
    const draft = drafts[row.id];
    return draft !== undefined && draft.trim().length > 0 && draft.trim() !== row.name;
  }

  function handleSave(row: Organisation) {
    const draft = drafts[row.id]?.trim();
    if (!draft) return;
    setRows((prev) => prev.map((candidate) => (candidate.id === row.id ? { ...candidate, name: draft } : candidate)));
    setSavedIds((prev) => ({ ...prev, [row.id]: true }));
    setTimeout(() => setSavedIds((prev) => ({ ...prev, [row.id]: false })), 2000);
  }

  if (rows.length === 0) {
    return (
      <p className="rounded-card border border-dashed border-line bg-surface p-6 text-center text-sm text-muted">
        Nothing waiting for rename.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-card border border-line bg-surface">
      <table className="w-full min-w-[560px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs font-medium text-muted">
            <th className="px-3 py-2">Name</th>
            <th className="px-3 py-2">Domain</th>
            <th className="px-3 py-2">Kind</th>
            <th className="px-3 py-2 text-right">Members</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-line last:border-b-0 hover:bg-line/20">
              <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <input
                    value={drafts[row.id] ?? row.name}
                    onChange={(event) => setDrafts((prev) => ({ ...prev, [row.id]: event.target.value }))}
                    aria-label={`Name for ${row.primaryDomain}`}
                    className="w-full min-w-[140px] rounded-control border border-line bg-background px-2 py-1 text-sm text-foreground transition-colors duration-200 focus:outline-none"
                  />
                  {row.autoCreated && (
                    <span className="shrink-0 rounded-control bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                      Auto
                    </span>
                  )}
                </div>
              </td>
              <td className="px-3 py-2 text-muted">{row.primaryDomain}</td>
              <td className="px-3 py-2 text-muted capitalize">{row.kind}</td>
              <td className="px-3 py-2 text-right tabular-nums text-foreground">{row.memberCount}</td>
              <td className="px-3 py-2 text-right">
                <button
                  type="button"
                  disabled={!isDirty(row)}
                  onClick={() => handleSave(row)}
                  className="inline-flex cursor-pointer items-center gap-1 rounded-control bg-primary px-2.5 py-1 text-xs font-semibold text-on-primary transition-colors duration-200 hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {savedIds[row.id] ? (
                    <>
                      <CheckIcon size={12} /> Saved
                    </>
                  ) : (
                    "Save"
                  )}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
