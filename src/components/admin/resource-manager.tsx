"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileText,
  Info,
  Paperclip,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { api } from "@/lib/api-client";
import { ConfirmDialog } from "./confirm-dialog";
import {
  BTN_PRIMARY,
  BTN_SECONDARY,
  CARD,
  Chip,
  EmptyState,
  ErrorBox,
  FIELD,
  ICON_BTN,
  ICON_BTN_DANGER,
  LABEL,
  SectionCard,
  SkeletonRows,
  TEXTAREA,
  errorMessage,
  useAsync,
} from "./admin-ui";

/* ============================================================
   API shapes - /admin/topics/:id/resources and /admin/resources/:id
   ============================================================ */

export type ResourceKind = "file" | "prompt" | "link";

export interface AdminResource {
  id: string;
  kind: ResourceKind;
  title: string;
  description: string | null;
  sort_order: number;
  is_preview: boolean;
  filename?: string | null;
  mime_type?: string | null;
  size_bytes?: number | null;
  body?: string | null;
  url?: string | null;
}

interface ResourceListResponse {
  data: AdminResource[];
}

interface UploadDescriptor {
  upload_url: string;
  key: string;
  method: "PUT" | "POST";
  headers: Record<string, string>;
  expires_in_sec: number;
  kind: string;
  filename: string | null;
}

/** Mirrors config.limits.maxAttachmentBytes, enforced again by the API. */
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

const KIND_LABEL: Record<ResourceKind, string> = {
  file: "File",
  prompt: "Prompt",
  link: "Link",
};

const KIND_HINT: Record<ResourceKind, string> = {
  file: "A download - PDF, DOCX, XLSX, a template. Learners get it through a signed redirect.",
  prompt: "Copy-pasteable text. Learners get a Copy button next to it.",
  link: "An external page. Opens in a new tab.",
};

/* ============================================================
   Upload plumbing (attachments only - one small file at a time)
   ============================================================ */

function putFile(
  descriptor: UploadDescriptor,
  file: File,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(descriptor.method, descriptor.upload_url, true);
    for (const [name, value] of Object.entries(descriptor.headers)) {
      xhr.setRequestHeader(name, value);
    }
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable && e.total > 0) {
        onProgress(Math.min(99, Math.round((e.loaded / e.total) * 100)));
      }
    });
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve();
        return;
      }
      let message = `Upload failed (HTTP ${xhr.status}). Please try again.`;
      try {
        const parsed: unknown = JSON.parse(xhr.responseText);
        const apiMessage = (parsed as { error?: { message?: string } })?.error?.message;
        if (typeof apiMessage === "string" && apiMessage.length > 0) message = apiMessage;
      } catch {
        // S3 answers XML - the status code is the useful part.
      }
      reject(new Error(message));
    });
    xhr.addEventListener("error", () =>
      reject(new Error("The upload connection dropped. Check your network and try again.")),
    );
    xhr.send(file);
  });
}

async function uploadAttachment(
  topicId: string,
  file: File,
  onProgress: (pct: number) => void,
): Promise<string> {
  const descriptor = await api.post<UploadDescriptor>(`/admin/topics/${topicId}/upload-url`, {
    kind: "attachment",
    mimeType: file.type || "application/octet-stream",
    sizeBytes: file.size,
    filename: file.name,
  });
  await putFile(descriptor, file, onProgress);
  return descriptor.key;
}

/* ============================================================
   Add / edit form
   ============================================================ */

interface DraftPayload {
  /** Only on create - the API treats `kind` as immutable. */
  kind?: ResourceKind;
  title: string;
  description: string | null;
  isPreview: boolean;
  body?: string | null;
  url?: string | null;
  s3Key?: string;
  filename?: string;
  mimeType?: string;
  sizeBytes?: number;
}

function ResourceForm({
  topicId,
  existing,
  onSaved,
  onCancel,
}: {
  topicId: string;
  /** Null when adding. */
  existing: AdminResource | null;
  onSaved: (message: string) => void;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState<ResourceKind>(existing?.kind ?? "file");
  const [title, setTitle] = useState(existing?.title ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [body, setBody] = useState(existing?.body ?? "");
  const [url, setUrl] = useState(existing?.url ?? "");
  const [isPreview, setIsPreview] = useState(existing?.is_preview ?? false);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  const editing = existing !== null;
  const formId = existing ? `resource-${existing.id}` : "resource-new";

  async function submit() {
    setError("");

    if (!title.trim()) {
      setError("Give the resource a title.");
      return;
    }
    if (kind === "prompt" && body.trim() === "") {
      setError("A prompt needs its text.");
      return;
    }
    if (kind === "link" && url.trim() === "") {
      setError("A link needs a URL.");
      return;
    }
    if (kind === "file" && !file && !editing) {
      setError("Choose a file to upload.");
      return;
    }
    if (file && file.size > MAX_ATTACHMENT_BYTES) {
      setError("That file is over the 25 MB limit.");
      return;
    }

    setSaving(true);
    setProgress(0);
    try {
      const payload: DraftPayload = {
        title: title.trim(),
        description: description.trim() === "" ? null : description.trim(),
        isPreview,
      };

      if (kind === "prompt") payload.body = body;
      if (kind === "link") payload.url = url.trim();

      if (editing) {
        // `kind` and the stored file are immutable - only the fields the
        // update schema accepts are sent.
        await api.patch(`/admin/resources/${existing.id}`, payload);
        onSaved("Resource updated.");
      } else {
        payload.kind = kind;
        if (kind === "file" && file) {
          const key = await uploadAttachment(topicId, file, setProgress);
          payload.s3Key = key;
          payload.filename = file.name;
          payload.mimeType = file.type || "application/octet-stream";
          payload.sizeBytes = file.size;
        }
        await api.post(`/admin/topics/${topicId}/resources`, payload);
        onSaved("Resource added.");
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
      setProgress(0);
    }
  }

  return (
    <div className={`${CARD} p-4 sm:p-5`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold">{editing ? `Edit ${existing.title}` : "Add a resource"}</h3>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Close the resource form"
          className={ICON_BTN}
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>

      {error && <ErrorBox message={error} className="mt-4" />}

      <div className="mt-4 grid gap-5">
        {editing ? (
          <div>
            <p className={LABEL}>Kind</p>
            <p className="mt-1.5 text-sm text-ink-muted">
              {KIND_LABEL[kind]} - {KIND_HINT[kind]}
            </p>
            <p className="mt-1 text-xs text-ink-faint">
              The kind cannot be changed. Delete this one and add a new resource instead.
            </p>
          </div>
        ) : (
          <fieldset>
            <legend className={LABEL}>Kind</legend>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {(["file", "prompt", "link"] as const).map((option) => (
                <label
                  key={option}
                  className={`flex min-h-12 cursor-pointer items-center gap-2 rounded-md border px-4 text-sm font-semibold transition-colors ${
                    kind === option
                      ? "border-primary bg-primary-soft text-primary-strong"
                      : "border-line text-ink-muted hover:border-line-strong"
                  }`}
                >
                  <input
                    type="radio"
                    name={`${formId}-kind`}
                    value={option}
                    checked={kind === option}
                    onChange={() => setKind(option)}
                    className="size-4 accent-[var(--color-primary)]"
                  />
                  {KIND_LABEL[option]}
                </label>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-ink-faint">{KIND_HINT[kind]}</p>
          </fieldset>
        )}

        <div>
          <label htmlFor={`${formId}-title`} className={LABEL}>
            Title <span className="text-danger">*</span>
          </label>
          <input
            id={`${formId}-title`}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={`${FIELD} mt-1.5`}
          />
        </div>

        <div>
          <label htmlFor={`${formId}-description`} className={LABEL}>
            Description
          </label>
          <input
            id={`${formId}-description`}
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={`${FIELD} mt-1.5`}
          />
        </div>

        {kind === "prompt" && (
          <div>
            <label htmlFor={`${formId}-body`} className={LABEL}>
              Prompt text <span className="text-danger">*</span>
            </label>
            <textarea
              id={`${formId}-body`}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              className={`${TEXTAREA} mt-1.5 font-mono`}
            />
          </div>
        )}

        {kind === "link" && (
          <div>
            <label htmlFor={`${formId}-url`} className={LABEL}>
              URL <span className="text-danger">*</span>
            </label>
            <input
              id={`${formId}-url`}
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://"
              className={`${FIELD} mt-1.5`}
            />
          </div>
        )}

        {kind === "file" && editing && (
          <div>
            <p className={LABEL}>File</p>
            <p className="mt-1.5 text-sm text-ink-muted">{existing.filename ?? "Attached"}</p>
            <p className="mt-1 text-xs text-ink-faint">
              The stored file cannot be swapped. Delete this resource and add the new file.
            </p>
          </div>
        )}

        {kind === "file" && !editing && (
          <div>
            <label htmlFor={`${formId}-file`} className={LABEL}>
              File <span className="text-danger">*</span>
            </label>
            <input
              id={`${formId}-file`}
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className={`${FIELD} mt-1.5 py-3 text-sm`}
            />
            <p className="mt-1 text-xs text-ink-faint">
              PDF, DOCX, XLSX, PPTX, CSV or an image. Up to 25 MB.
            </p>
            {saving && progress > 0 && (
              <div
                role="progressbar"
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="File upload progress"
                className="mt-2 h-2 w-full overflow-hidden rounded-full bg-band"
              >
                <div
                  className="h-full rounded-full bg-primary transition-[width]"
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}
          </div>
        )}

        <div>
          <label className="flex min-h-12 w-fit cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={isPreview}
              onChange={(e) => setIsPreview(e.target.checked)}
              className="size-5 accent-[var(--color-primary)]"
            />
            <span className="text-sm font-semibold">Free preview</span>
          </label>
          <p className="text-xs leading-relaxed text-ink-faint">
            Preview resources are visible to everyone, including trial and free accounts.
            Everything else stays locked until they subscribe.
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={saving}
          className={BTN_PRIMARY}
        >
          {saving ? "Saving..." : editing ? "Save resource" : "Add resource"}
        </button>
        <button type="button" onClick={onCancel} disabled={saving} className={BTN_SECONDARY}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   Row
   ============================================================ */

function ResourceRow({
  resource,
  index,
  total,
  busy,
  onEdit,
  onMove,
  onDelete,
}: {
  resource: AdminResource;
  index: number;
  total: number;
  busy: boolean;
  onEdit: () => void;
  onMove: (index: number, delta: number) => void;
  onDelete: () => void;
}) {
  const Icon =
    resource.kind === "prompt" ? Sparkles : resource.kind === "link" ? ExternalLink : FileText;

  return (
    <li className={`${CARD} p-4`}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex shrink-0 flex-col items-center gap-1">
          <button
            type="button"
            aria-label={`Move ${resource.title} up`}
            disabled={index === 0 || busy}
            onClick={() => onMove(index, -1)}
            className={ICON_BTN}
          >
            <ChevronUp className="size-4" aria-hidden="true" />
          </button>
          <span className="text-xs font-semibold tabular-nums text-ink-faint">{index + 1}</span>
          <button
            type="button"
            aria-label={`Move ${resource.title} down`}
            disabled={index === total - 1 || busy}
            onClick={() => onMove(index, 1)}
            className={ICON_BTN}
          >
            <ChevronDown className="size-4" aria-hidden="true" />
          </button>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Icon className="size-4 shrink-0 text-ink-faint" aria-hidden="true" />
            <h4 className="min-w-0 font-semibold">{resource.title}</h4>
            <Chip>{KIND_LABEL[resource.kind] ?? "Resource"}</Chip>
            {resource.is_preview && <Chip tone="primary">Free preview</Chip>}
          </div>

          {resource.description && (
            <p className="mt-1 text-sm leading-relaxed text-ink-muted">{resource.description}</p>
          )}

          {resource.kind === "file" && resource.filename && (
            <p className="mt-1 text-xs text-ink-faint">{resource.filename}</p>
          )}
          {resource.kind === "link" && resource.url && (
            <p className="mt-1 truncate text-xs text-ink-faint">{resource.url}</p>
          )}
          {resource.kind === "prompt" && resource.body && (
            <p className="mt-1 line-clamp-2 font-mono text-xs text-ink-faint">{resource.body}</p>
          )}
        </div>

        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            aria-label={`Edit ${resource.title}`}
            onClick={onEdit}
            disabled={busy}
            className={ICON_BTN}
          >
            <Pencil className="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label={`Delete ${resource.title}`}
            onClick={onDelete}
            disabled={busy}
            className={ICON_BTN_DANGER}
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </li>
  );
}

/* ============================================================
   The panel
   ============================================================ */

export function ResourceManager({ topicId }: { topicId: string }) {
  const list = useAsync<ResourceListResponse>(`topic-resources|${topicId}`, () =>
    api.get<ResourceListResponse>(`/admin/topics/${topicId}/resources`),
  );

  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AdminResource | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");

  const items = [...(list.data?.data ?? [])].sort((a, b) => a.sort_order - b.sort_order);

  function afterWrite(message: string) {
    setAdding(false);
    setEditingId(null);
    setNotice(message);
    setActionError("");
    list.reload();
  }

  /** Reorder by swapping the two rows' sort_order, then refetching. */
  async function move(index: number, delta: number) {
    const target = items[index + delta];
    const current = items[index];
    if (!current || !target) return;

    setBusy(true);
    setActionError("");
    setNotice("");
    try {
      await api.patch(`/admin/resources/${current.id}`, { sortOrder: target.sort_order });
      await api.patch(`/admin/resources/${target.id}`, { sortOrder: current.sort_order });
      setNotice("Order updated.");
      list.reload();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setPendingDelete(null);
    setBusy(true);
    setActionError("");
    setNotice("");
    try {
      await api.delete(`/admin/resources/${target.id}`);
      setNotice(`${target.title} deleted.`);
      list.reload();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionCard
      id="topic-resources"
      title="Resources"
      description="Downloads, reusable prompts and external links for this topic. Mark the ones that should stay open to non-subscribers as a free preview."
      action={
        <button
          type="button"
          onClick={() => {
            setEditingId(null);
            setAdding(true);
          }}
          className={BTN_PRIMARY}
        >
          <Plus className="size-4" aria-hidden="true" />
          Add resource
        </button>
      }
    >
      <p role="status" aria-live="polite" className="min-h-6 text-sm font-semibold text-success">
        {notice}
      </p>

      {actionError && <ErrorBox message={actionError} className="mb-4" />}

      {adding && (
        <div className="mb-4">
          <ResourceForm
            topicId={topicId}
            existing={null}
            onSaved={afterWrite}
            onCancel={() => setAdding(false)}
          />
        </div>
      )}

      {list.loading && <SkeletonRows rows={3} />}

      {!list.loading && list.error && (
        <ErrorBox message={list.error} onRetry={list.reload} />
      )}

      {!list.loading && !list.error && items.length === 0 && !adding && (
        <EmptyState
          title="No resources yet"
          hint="Add a template, a prompt or a link. They appear under the episodes on the topic page."
        />
      )}

      {!list.loading && !list.error && items.length > 0 && (
        <ul className="flex flex-col gap-3">
          {items.map((resource, index) =>
            editingId === resource.id ? (
              <li key={resource.id}>
                <ResourceForm
                  topicId={topicId}
                  existing={resource}
                  onSaved={afterWrite}
                  onCancel={() => setEditingId(null)}
                />
              </li>
            ) : (
              <ResourceRow
                key={resource.id}
                resource={resource}
                index={index}
                total={items.length}
                busy={busy}
                onEdit={() => {
                  setAdding(false);
                  setEditingId(resource.id);
                }}
                onMove={(i, delta) => void move(i, delta)}
                onDelete={() => setPendingDelete(resource)}
              />
            ),
          )}
        </ul>
      )}

      <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-ink-faint">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        <span>
          <Paperclip className="mr-1 inline size-3" aria-hidden="true" />
          Files are served through a signed redirect, so the entitlement check runs on every
          download rather than once at page load.
        </span>
      </p>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this resource?"
        description={
          pendingDelete
            ? `${pendingDelete.title} will be removed from the topic page. This cannot be undone.`
            : ""
        }
        confirmLabel="Delete"
        destructive
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </SectionCard>
  );
}
