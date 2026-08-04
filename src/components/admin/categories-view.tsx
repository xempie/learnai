"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Info, Merge, Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api-client";
import { ConfirmDialog } from "./confirm-dialog";
import {
  BTN_PRIMARY,
  BTN_SECONDARY,
  CARD,
  EmptyState,
  ErrorBox,
  FIELD,
  ICON_BTN,
  ICON_BTN_DANGER,
  LABEL,
  PageHeader,
  SectionCard,
  SkeletonRows,
  TD,
  TH,
  errorMessage,
  num,
  slugify,
  useAsync,
} from "./admin-ui";

interface AdminCategory {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  color_hex: string | null;
  sort_order: number;
  is_active: boolean;
  topic_count: number;
}

interface CategoryListResponse {
  data: AdminCategory[];
}

interface MergeResponse {
  source: AdminCategory;
  target: AdminCategory;
  topics_moved: number;
  topics_skipped: number;
  users_moved: number;
  users_skipped: number;
}

export function CategoriesView() {
  const list = useAsync<CategoryListResponse>("admin-categories", () =>
    api.get<CategoryListResponse>("/admin/categories"),
  );

  const [message, setMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  /* new-category form */
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [colorHex, setColorHex] = useState("#1e40af");
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState("");

  /* inline edit */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editColor, setEditColor] = useState("#1e40af");

  /* merge */
  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [confirmMerge, setConfirmMerge] = useState(false);

  const [pendingDelete, setPendingDelete] = useState<AdminCategory | null>(null);

  const rows = useMemo(
    () => [...(list.data?.data ?? [])].sort((a, b) => a.sort_order - b.sort_order),
    [list.data],
  );

  const derivedSlug = slugify(name);
  const effectiveSlug = slugTouched ? slug : derivedSlug;

  const source = rows.find((r) => r.id === sourceId);
  const target = rows.find((r) => r.id === targetId);

  async function mutate(id: string | null, work: () => Promise<string>) {
    setBusyId(id);
    setActionError("");
    setMessage("");
    try {
      const success = await work();
      setMessage(success);
      list.reload();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  function toggleActive(cat: AdminCategory) {
    void mutate(cat.id, async () => {
      await api.patch(`/admin/categories/${cat.id}`, { isActive: !cat.is_active });
      return `"${cat.name}" is now ${cat.is_active ? "inactive" : "active"}.`;
    });
  }

  function move(index: number, delta: number) {
    const a = rows[index];
    const b = rows[index + delta];
    if (!a || !b) return;
    void mutate(a.id, async () => {
      await api.patch(`/admin/categories/${a.id}`, { sortOrder: b.sort_order });
      await api.patch(`/admin/categories/${b.id}`, { sortOrder: a.sort_order });
      return `Moved "${a.name}" ${delta < 0 ? "up" : "down"}.`;
    });
  }

  function startEdit(cat: AdminCategory) {
    setEditingId(cat.id);
    setEditName(cat.name);
    setEditDescription(cat.description ?? "");
    setEditColor(cat.color_hex ?? "#1e40af");
  }

  function saveEdit(cat: AdminCategory) {
    void mutate(cat.id, async () => {
      await api.patch(`/admin/categories/${cat.id}`, {
        name: editName.trim(),
        description: editDescription.trim() === "" ? null : editDescription.trim(),
        colorHex: editColor,
      });
      setEditingId(null);
      return `Saved "${editName.trim()}".`;
    });
  }

  async function createCategory() {
    if (name.trim().length < 2) {
      setFormError("A name of at least 2 characters is required.");
      return;
    }
    setCreating(true);
    setFormError("");
    try {
      await api.post("/admin/categories", {
        name: name.trim(),
        slug: effectiveSlug || undefined,
        description: description.trim() === "" ? null : description.trim(),
        colorHex: colorHex,
        sortOrder: rows.length + 1,
      });
      setMessage(`Created category "${name.trim()}".`);
      setName("");
      setSlug("");
      setSlugTouched(false);
      setDescription("");
      setColorHex("#1e40af");
      setShowForm(false);
      list.reload();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setCreating(false);
    }
  }

  function applyMerge() {
    setConfirmMerge(false);
    if (!source || !target) return;
    const from = source;
    const into = target;
    void mutate(from.id, async () => {
      const result = await api.post<MergeResponse>(`/admin/categories/${from.id}/merge`, {
        targetCategoryId: into.id,
      });
      setSourceId("");
      setTargetId("");
      return `Merged "${from.name}" into "${into.name}": ${num(result.topics_moved)} topic${
        result.topics_moved === 1 ? "" : "s"
      } and ${num(result.users_moved)} learner preference${
        result.users_moved === 1 ? "" : "s"
      } moved. "${from.name}" is now deactivated.`;
    });
  }

  function applyDelete() {
    const cat = pendingDelete;
    setPendingDelete(null);
    if (!cat) return;
    void mutate(cat.id, async () => {
      await api.delete(`/admin/categories/${cat.id}`);
      return `Deleted "${cat.name}".`;
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Categories"
        description="Order here is the order learners see in onboarding and in the feed filter."
      >
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className={BTN_PRIMARY}
          aria-expanded={showForm}
        >
          <Plus className="size-5" aria-hidden="true" />
          New category
        </button>
      </PageHeader>

      <p role="status" aria-live="polite" className="min-h-6 text-sm font-semibold text-success">
        {message}
      </p>

      {actionError && <ErrorBox message={actionError} />}

      {/* ===== New category form ===== */}
      {showForm && (
        <SectionCard id="new-category" title="New category">
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="cat-name" className={LABEL}>
                Name <span className="text-danger">*</span>
              </label>
              <input
                id="cat-name"
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!slugTouched) setSlug(slugify(e.target.value));
                }}
                className={`${FIELD} mt-1.5`}
              />
            </div>
            <div>
              <label htmlFor="cat-slug" className={LABEL}>
                Slug
              </label>
              <input
                id="cat-slug"
                type="text"
                value={effectiveSlug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(slugify(e.target.value));
                }}
                className={`${FIELD} mt-1.5 font-mono text-sm`}
              />
              <p className="mt-1 text-xs text-ink-faint">
                Derived from the name: <code>/{derivedSlug || "..."}</code>
              </p>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="cat-desc" className={LABEL}>
                Description
              </label>
              <input
                id="cat-desc"
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className={`${FIELD} mt-1.5`}
              />
            </div>
            <div>
              <label htmlFor="cat-colour" className={LABEL}>
                Colour
              </label>
              <div className="mt-1.5 flex items-center gap-3">
                <input
                  id="cat-colour"
                  type="color"
                  value={colorHex}
                  onChange={(e) => setColorHex(e.target.value)}
                  className="h-12 w-16 cursor-pointer rounded-field border border-line bg-surface p-1"
                />
                <code className="text-sm text-ink-muted">{colorHex}</code>
              </div>
            </div>
          </div>

          {formError && <ErrorBox message={formError} className="mt-4" />}

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void createCategory()}
              disabled={creating}
              className={BTN_PRIMARY}
            >
              {creating ? "Creating..." : "Create category"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setFormError("");
              }}
              className={BTN_SECONDARY}
            >
              Cancel
            </button>
          </div>
        </SectionCard>
      )}

      {/* ===== Category table ===== */}
      {list.error ? (
        <ErrorBox message={list.error} onRetry={list.reload} />
      ) : list.loading ? (
        <div className={`${CARD} p-4`}>
          <SkeletonRows rows={6} />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No categories yet."
          hint="Create the first one - content cannot be published without a category."
        />
      ) : (
        <div className={`${CARD} overflow-x-auto`}>
          <table className="w-full min-w-240 border-collapse text-sm">
            <caption className="sr-only">All categories in display order</caption>
            <thead>
              <tr>
                <th scope="col" className={TH}>
                  Order
                </th>
                <th scope="col" className={TH}>
                  Category
                </th>
                <th scope="col" className={TH}>
                  Slug
                </th>
                <th scope="col" className={TH}>
                  Description
                </th>
                <th scope="col" className={`${TH} text-right`}>
                  Content
                </th>
                <th scope="col" className={TH}>
                  Active
                </th>
                <th scope="col" className={`${TH} text-right`}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((cat, i) => {
                const busy = busyId === cat.id;
                const editing = editingId === cat.id;
                return (
                  <tr key={cat.id}>
                    <td className={TD}>
                      <div className="flex items-center gap-1.5">
                        <span className="w-6 tabular-nums text-ink-faint">{cat.sort_order}</span>
                        <button
                          type="button"
                          aria-label={`Move ${cat.name} up`}
                          onClick={() => move(i, -1)}
                          disabled={i === 0 || busy}
                          className={ICON_BTN}
                        >
                          <ChevronUp className="size-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Move ${cat.name} down`}
                          onClick={() => move(i, 1)}
                          disabled={i === rows.length - 1 || busy}
                          className={ICON_BTN}
                        >
                          <ChevronDown className="size-4" aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                    <td className={TD}>
                      {editing ? (
                        <div className="flex flex-col gap-2">
                          <label htmlFor={`edit-name-${cat.id}`} className="sr-only">
                            Name
                          </label>
                          <input
                            id={`edit-name-${cat.id}`}
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className={FIELD}
                          />
                          <div className="flex items-center gap-2">
                            <label htmlFor={`edit-colour-${cat.id}`} className="sr-only">
                              Colour
                            </label>
                            <input
                              id={`edit-colour-${cat.id}`}
                              type="color"
                              value={editColor}
                              onChange={(e) => setEditColor(e.target.value)}
                              className="h-11 w-14 cursor-pointer rounded-field border border-line bg-surface p-1"
                            />
                            <code className="text-xs text-ink-muted">{editColor}</code>
                          </div>
                        </div>
                      ) : (
                        <span className="flex items-center gap-2.5 font-medium">
                          <span
                            aria-hidden="true"
                            className="size-5 shrink-0 rounded-md border border-line"
                            style={{
                              backgroundColor: cat.color_hex ?? "var(--color-line-strong)",
                            }}
                          />
                          {cat.name}
                        </span>
                      )}
                    </td>
                    <td className={`${TD} font-mono text-xs text-ink-muted`}>/{cat.slug}</td>
                    <td className={`${TD} max-w-96 text-ink-muted`}>
                      {editing ? (
                        <>
                          <label htmlFor={`edit-desc-${cat.id}`} className="sr-only">
                            Description
                          </label>
                          <input
                            id={`edit-desc-${cat.id}`}
                            type="text"
                            value={editDescription}
                            onChange={(e) => setEditDescription(e.target.value)}
                            className={FIELD}
                          />
                        </>
                      ) : (
                        (cat.description ?? "-")
                      )}
                    </td>
                    <td className={`${TD} text-right tabular-nums`}>{num(cat.topic_count)}</td>
                    <td className={TD}>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={cat.is_active}
                        aria-label={`${cat.name} active`}
                        disabled={busy}
                        onClick={() => toggleActive(cat)}
                        className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${
                          cat.is_active ? "bg-primary" : "bg-line-strong"
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`absolute top-1 size-6 rounded-full bg-white shadow-sm transition-transform ${
                            cat.is_active ? "translate-x-7" : "translate-x-1"
                          }`}
                        />
                      </button>
                    </td>
                    <td className={TD}>
                      <div className="flex flex-col items-end gap-1">
                        <div className="flex gap-1.5">
                          {editing ? (
                            <>
                              <button
                                type="button"
                                onClick={() => saveEdit(cat)}
                                disabled={busy}
                                className={BTN_PRIMARY}
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingId(null)}
                                className={BTN_SECONDARY}
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              aria-label={`Edit ${cat.name}`}
                              title="Edit"
                              onClick={() => startEdit(cat)}
                              className={ICON_BTN}
                            >
                              <Pencil className="size-4" aria-hidden="true" />
                            </button>
                          )}
                          <button
                            type="button"
                            aria-label={
                              cat.topic_count > 0
                                ? `Delete ${cat.name} - unavailable, category still has content`
                                : `Delete ${cat.name}`
                            }
                            title={
                              cat.topic_count > 0
                                ? "Categories with content cannot be deleted - deactivate instead"
                                : "Delete"
                            }
                            disabled={cat.topic_count > 0 || busy}
                            onClick={() => setPendingDelete(cat)}
                            className={ICON_BTN_DANGER}
                          >
                            <Trash2 className="size-4" aria-hidden="true" />
                          </button>
                        </div>
                        {cat.topic_count > 0 && (
                          <span className="text-right text-xs text-ink-faint">
                            Has content - deactivate instead
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ===== Merge ===== */}
      <SectionCard
        id="merge"
        title="Merge categories"
        description="Use this when two categories have drifted into the same thing. The source is emptied and deactivated, never deleted."
      >
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-60 flex-1">
            <label htmlFor="merge-source" className={LABEL}>
              Move content from
            </label>
            <select
              id="merge-source"
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
              className={`${FIELD} mt-1.5`}
            >
              <option value="">Select a category...</option>
              {rows.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.topic_count})
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-60 flex-1">
            <label htmlFor="merge-target" className={LABEL}>
              Into
            </label>
            <select
              id="merge-target"
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              className={`${FIELD} mt-1.5`}
            >
              <option value="">Select a category...</option>
              {rows
                .filter((r) => r.id !== sourceId)
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.topic_count})
                  </option>
                ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => setConfirmMerge(true)}
            disabled={!source || !target}
            className={BTN_SECONDARY}
          >
            <Merge className="size-4" aria-hidden="true" />
            Merge...
          </button>
        </div>
        <p className="mt-3 flex items-start gap-2 rounded-md bg-band px-3 py-2 text-xs leading-relaxed text-ink-faint">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          Learners who picked the source category during onboarding keep their preference - it is
          rewritten to point at the target.
        </p>
      </SectionCard>

      <ConfirmDialog
        open={confirmMerge && !!source && !!target}
        title="Merge these categories?"
        description={
          <>
            All content and user preferences move from{" "}
            <strong className="text-ink">{source?.name}</strong> to{" "}
            <strong className="text-ink">{target?.name}</strong>, then{" "}
            <strong className="text-ink">{source?.name}</strong> is deactivated. Content counts are
            combined. This is written to the audit log.
          </>
        }
        confirmLabel="Merge categories"
        onConfirm={applyMerge}
        onCancel={() => setConfirmMerge(false)}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this category?"
        description={
          <>
            <strong className="text-ink">{pendingDelete?.name}</strong> has no content attached, so
            deleting it is safe. Learners who selected it during onboarding will be asked to pick
            again.
          </>
        }
        confirmLabel="Delete category"
        destructive
        onConfirm={applyDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
