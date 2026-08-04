"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import {
  Copy,
  Download,
  ExternalLink,
  FileText,
  Link as LinkIcon,
  Lock,
  RefreshCw,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { api } from "@/lib/api-client";
import { useApiResource } from "@/components/notifications-view";

/**
 * Topic resources: downloadable files, reusable prompts and external links.
 *
 * The API decides what a viewer may have; a locked row never renders its
 * payload, and this component refuses to render one even if `body`/`url`
 * somehow arrive on a locked record. Downloads go through the API redirect
 * so the entitlement check happens server-side on every click.
 */

export type ResourceKind = "file" | "prompt" | "link";

export interface TopicResource {
  id: string;
  kind: ResourceKind;
  title: string;
  description?: string | null;
  sort_order?: number;
  is_preview?: boolean;
  locked?: boolean;
  filename?: string | null;
  mime_type?: string | null;
  size_bytes?: number | null;
  body?: string | null;
  url?: string | null;
}

interface ResourceListResponse {
  data: TopicResource[];
}

/** Human-readable file size, 1000-based (matches how the data is authored). */
function formatBytes(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`;
  const kb = bytes / 1000;
  if (kb < 1000) return `${Math.round(kb)} KB`;
  const mb = kb / 1000;
  return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1)} MB`;
}

function fileLabel(mime?: string | null): string {
  if (!mime) return "File";
  if (mime === "application/pdf") return "PDF document";
  if (mime.includes("wordprocessingml") || mime === "application/msword") return "Word document";
  if (mime.includes("spreadsheetml") || mime === "application/vnd.ms-excel")
    return "Excel spreadsheet";
  if (mime.includes("presentationml")) return "PowerPoint deck";
  if (mime.startsWith("image/")) return "Image";
  if (mime.startsWith("text/")) return "Text file";
  return "File";
}

const KIND_ICON = {
  file: FileText,
  prompt: Sparkles,
  link: LinkIcon,
} as const;

const KIND_LABEL: Record<ResourceKind, string> = {
  file: "Download",
  prompt: "Prompt",
  link: "Link",
};

const ROW = "rounded-md border border-line bg-band px-4 py-3";
const ACTION =
  "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md border border-line bg-surface px-4 text-sm font-semibold text-ink transition-colors hover:border-primary hover:text-primary-strong";
const ACTION_DISABLED =
  "inline-flex min-h-11 shrink-0 cursor-not-allowed items-center gap-2 rounded-md border border-line bg-band px-4 text-sm font-semibold text-ink-faint";

/* ============================================================
   One row
   ============================================================ */

function LockedNote({ title }: { title: string }) {
  return (
    <p className="mt-2 flex items-center gap-2 text-sm text-ink-faint">
      <Lock className="size-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0">
        Included with a subscription.{" "}
        <Link
          href="/settings#subscription"
          className="font-semibold text-primary-strong hover:text-primary"
        >
          See plans
          <span className="sr-only"> to unlock {title}</span>
        </Link>
      </span>
    </p>
  );
}

function PromptRow({ resource, locked }: { resource: TopicResource; locked: boolean }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");

  const body = locked ? "" : (resource.body ?? "");

  async function copy() {
    setCopyError("");
    try {
      await navigator.clipboard.writeText(body);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 4000);
    } catch {
      setCopyError("Your browser blocked the copy. Select the text and copy it by hand.");
    }
  }

  if (locked || !body) {
    return locked ? (
      <LockedNote title={resource.title} />
    ) : (
      <p className="mt-2 text-sm text-ink-faint">This prompt has no text yet.</p>
    );
  }

  return (
    <div className="mt-3">
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md border border-line bg-surface p-3 font-mono text-sm leading-relaxed text-ink">
        {body}
      </pre>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => void copy()} className={ACTION}>
          <Copy className="size-4" aria-hidden="true" />
          Copy prompt
          <span className="sr-only">: {resource.title}</span>
        </button>
        <p aria-live="polite" className="text-sm font-semibold text-success">
          {copied ? "Copied to your clipboard." : ""}
        </p>
      </div>
      {copyError && (
        <p role="alert" className="mt-2 text-sm font-semibold text-danger">
          {copyError}
        </p>
      )}
    </div>
  );
}

function ResourceCard({ resource }: { resource: TopicResource }) {
  const locked = resource.locked === true;
  const Icon = KIND_ICON[resource.kind] ?? FileText;

  return (
    <li className={ROW}>
      <div className="flex flex-wrap items-start gap-3">
        <span
          aria-hidden="true"
          className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-surface"
        >
          <Icon className={`size-4 ${locked ? "text-ink-faint" : "text-primary-strong"}`} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={`font-semibold ${locked ? "text-ink-faint" : "text-ink"}`}>
              {resource.title}
            </span>
            <span className="rounded-full border border-line px-2 py-0.5 text-xs font-semibold text-ink-faint">
              {KIND_LABEL[resource.kind] ?? "Resource"}
            </span>
            {resource.is_preview && !locked && (
              <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary-strong">
                Free
              </span>
            )}
          </div>

          {resource.description && (
            <p className={`mt-1 text-sm ${locked ? "text-ink-faint" : "text-ink-muted"}`}>
              {resource.description}
            </p>
          )}

          {resource.kind === "file" && (
            <p className="mt-1 text-sm text-ink-faint">
              {resource.filename ? `${resource.filename} · ` : ""}
              {fileLabel(resource.mime_type)}
              {typeof resource.size_bytes === "number" && resource.size_bytes > 0
                ? ` · ${formatBytes(resource.size_bytes)}`
                : ""}
            </p>
          )}

          {resource.kind === "prompt" && <PromptRow resource={resource} locked={locked} />}

          {resource.kind !== "prompt" && locked && <LockedNote title={resource.title} />}
        </div>

        {/* ---- action ---- */}
        {resource.kind === "file" &&
          (locked ? (
            <span className={ACTION_DISABLED} aria-disabled="true">
              <Download className="size-4" aria-hidden="true" />
              Download
              <span className="sr-only">{resource.title} (subscribers only)</span>
            </span>
          ) : (
            <a href={`/api/v1/resources/${resource.id}/download`} className={ACTION}>
              <Download className="size-4" aria-hidden="true" />
              Download
              <span className="sr-only">: {resource.filename ?? resource.title}</span>
            </a>
          ))}

        {resource.kind === "link" &&
          (locked ? (
            <span className={ACTION_DISABLED} aria-disabled="true">
              <ExternalLink className="size-4" aria-hidden="true" />
              Open
              <span className="sr-only">{resource.title} (subscribers only)</span>
            </span>
          ) : (
            <a
              href={resource.url ?? `/api/v1/resources/${resource.id}/download`}
              target="_blank"
              rel="noopener noreferrer"
              className={ACTION}
            >
              <ExternalLink className="size-4" aria-hidden="true" />
              Open
              <span className="sr-only">: {resource.title} (opens in a new tab)</span>
            </a>
          ))}
      </div>
    </li>
  );
}

/* ============================================================
   Section
   ============================================================ */

export function TopicResources({ topicId }: { topicId: string }) {
  const fetcher = useCallback(
    () => api.get<ResourceListResponse>(`/topics/${topicId}/resources`),
    [topicId],
  );

  const { data, loading, error, reload } = useApiResource<ResourceListResponse>(
    fetcher,
    "We could not load the resources for this topic.",
  );

  const items = [...(data?.data ?? [])].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
  );

  return (
    <section
      aria-labelledby="resources-heading"
      className="rounded-card border border-line bg-surface p-5 shadow-xs"
    >
      <h2 id="resources-heading" className="flex items-center gap-2 font-semibold">
        <FileText className="size-5 text-primary-strong" aria-hidden="true" />
        Resources
        {!loading && !error && (
          <span className="font-normal text-ink-faint">({items.length})</span>
        )}
      </h2>

      {loading && (
        <div role="status" aria-live="polite" className="mt-3 flex flex-col gap-2.5">
          <span className="sr-only">Loading resources</span>
          <span className="block h-16 w-full animate-pulse rounded-md bg-band" />
          <span className="block h-16 w-full animate-pulse rounded-md bg-band opacity-60" />
        </div>
      )}

      {!loading && error && (
        <div role="alert" className="mt-3 rounded-md border border-danger/30 bg-danger-soft p-4">
          <p className="flex items-start gap-2 text-sm font-semibold text-danger">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0">{error}</span>
          </p>
          <button
            type="button"
            onClick={reload}
            className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-md border border-line bg-surface px-4 text-sm font-semibold text-ink hover:border-primary hover:text-primary-strong"
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            Try again
          </button>
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <p className="mt-3 rounded-md border border-dashed border-line-strong bg-band px-4 py-8 text-center text-sm text-ink-muted">
          No resources for this topic yet. Templates, prompts and links land here when they are
          published.
        </p>
      )}

      {!loading && !error && items.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {items.map((resource) => (
            <ResourceCard key={resource.id} resource={resource} />
          ))}
        </ul>
      )}
    </section>
  );
}
