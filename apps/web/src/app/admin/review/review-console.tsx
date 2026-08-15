"use client";

import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import {
  CheckIcon,
  CircleCheckBigIcon,
  ClockIcon,
  ExternalLinkIcon,
  EyeIcon,
  type IconProps,
  MessageSquareIcon,
  NewspaperIcon,
  PencilIcon,
  TriangleAlertIcon,
  VideoIcon,
  Wand2Icon,
  XIcon,
} from "@/components/icons";
import { Prose, splitFencedBlock } from "@/lib/markdown-lite";
import type { AdminReviewer, ContentKind, ContentSource, ReviewQueueItem } from "@/lib/sample-data";
import { verticalLabel } from "@/lib/verticals";

const inputClass =
  "w-full rounded-control border border-line bg-background px-3 py-2 text-sm text-foreground transition-colors duration-200 focus:outline-none";

function kindIcon(kind: ContentKind): ComponentType<IconProps> {
  if (kind === "news") return NewspaperIcon;
  if (kind === "technique") return Wand2Icon;
  if (kind === "video") return VideoIcon;
  return MessageSquareIcon;
}

function tierBadgeClasses(tier?: 1 | 2 | 3): string {
  if (tier === 1) return "bg-success/10 text-success";
  if (tier === 2) return "bg-accent/15 text-accent";
  return "bg-line text-muted";
}

/** mm:ss under an hour, "Xh YYm" beyond — tabular-numeral friendly either way. */
function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

interface QueueGroup {
  id: string;
  label: string;
  items: ReviewQueueItem[];
}

export function ReviewConsole({
  initialQueue,
  sources,
  reviewer,
}: {
  initialQueue: ReviewQueueItem[];
  sources: ContentSource[];
  reviewer: AdminReviewer;
}) {
  const sourceMap = useMemo(() => new Map(sources.map((source) => [source.id, source])), [sources]);

  const [items, setItems] = useState<ReviewQueueItem[]>(initialQueue);
  const [selectedId, setSelectedId] = useState<string | null>(initialQueue[0]?.id ?? null);
  const [now, setNow] = useState<number>(() => Date.now());
  const [openedAt, setOpenedAt] = useState<Record<string, number>>(() =>
    initialQueue[0] ? { [initialQueue[0].id]: Date.now() } : {},
  );
  const [editingDraft, setEditingDraft] = useState(false);
  const [tierTwoVerified, setTierTwoVerified] = useState<Record<string, boolean>>({});
  const [awaitingSecond, setAwaitingSecond] = useState<Record<string, boolean>>({});
  const [firstApprovedBy, setFirstApprovedBy] = useState<Record<string, string>>({});
  const [notesDrafts, setNotesDrafts] = useState<Record<string, string>>({});
  const [notesErrors, setNotesErrors] = useState<Record<string, string | null>>({});
  const [changesPanelOpenId, setChangesPanelOpenId] = useState<string | null>(null);
  const [rejectDialogId, setRejectDialogId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [reviewedCount, setReviewedCount] = useState(0);
  // Lazy-initialised once (the initializer function only runs on the first
  // render) and never set again — state, not a ref, specifically so its
  // value can be read directly during render for the session-total timer.
  const [sessionStart] = useState(() => Date.now());
  const [prevSelectedId, setPrevSelectedId] = useState(selectedId);

  const notesRef = useRef<HTMLTextAreaElement>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Session-wide clock — drives the per-item and session-total timers and
  // every queue row's "elapsed in review" figure. One interval for all of
  // it rather than one per row.
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Reset per-item UI state when the selection changes — adjusted during
  // render (React's recommended pattern for "reset state on prop change")
  // rather than an effect, so it lands in the same commit instead of
  // scheduling an extra render.
  if (selectedId !== prevSelectedId) {
    setPrevSelectedId(selectedId);
    setEditingDraft(false);
    setChangesPanelOpenId(null);
  }

  const selectedItem = items.find((item) => item.id === selectedId) ?? null;

  const groupedItems = useMemo<QueueGroup[]>(() => {
    const groups: QueueGroup[] = [];
    for (const item of items) {
      let group = groups.find((candidate) => candidate.id === item.draftEditionId);
      if (!group) {
        group = { id: item.draftEditionId, label: item.draftEditionLabel, items: [] };
        groups.push(group);
      }
      group.items.push(item);
    }
    return groups;
  }, [items]);

  function announce(message: string) {
    setToast(message);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setToast(null), 3500);
  }

  function selectItem(id: string) {
    setSelectedId(id);
    setOpenedAt((prev) => (prev[id] ? prev : { ...prev, [id]: Date.now() }));
  }

  function updateSelectedDraft(patch: Partial<Pick<ReviewQueueItem, "title" | "bodyMd">>) {
    if (!selectedItem) return;
    setItems((prev) => prev.map((item) => (item.id === selectedItem.id ? { ...item, ...patch } : item)));
  }

  function advanceFrom(list: ReviewQueueItem[], removedId: string): void {
    const currentIndex = items.findIndex((item) => item.id === removedId);
    const next = list[currentIndex] ?? list[currentIndex - 1] ?? null;
    if (next) selectItem(next.id);
    else setSelectedId(null);
  }

  function approveDisabledReason(item: ReviewQueueItem): string | null {
    if (item.tierTwoVerificationRequired && !tierTwoVerified[item.id]) {
      return "Tick the source verification checkbox first.";
    }
    if (item.requiresSecondApproval && awaitingSecond[item.id] && firstApprovedBy[item.id] === reviewer.id) {
      return "You already gave the first approval — a different reviewer must give the second.";
    }
    return null;
  }

  function handleApprove(item: ReviewQueueItem) {
    if (approveDisabledReason(item)) return;
    setReviewedCount((count) => count + 1);

    if (item.requiresSecondApproval && !awaitingSecond[item.id]) {
      setAwaitingSecond((prev) => ({ ...prev, [item.id]: true }));
      setFirstApprovedBy((prev) => ({ ...prev, [item.id]: reviewer.id }));
      announce(`First approval recorded for "${item.title}" — awaiting a second reviewer.`);
      const currentIndex = items.findIndex((candidate) => candidate.id === item.id);
      const next = items[currentIndex + 1] ?? items[currentIndex - 1] ?? null;
      if (next && next.id !== item.id) selectItem(next.id);
      return;
    }

    const remaining = items.filter((candidate) => candidate.id !== item.id);
    setItems(remaining);
    announce(`"${item.title}" approved.`);
    advanceFrom(remaining, item.id);
  }

  function handleRequestChangesSubmit(item: ReviewQueueItem) {
    const notes = (notesDrafts[item.id] ?? "").trim();
    if (notes.length < 10) {
      setNotesErrors((prev) => ({ ...prev, [item.id]: "Add at least 10 characters describing what needs to change." }));
      return;
    }
    setNotesErrors((prev) => ({ ...prev, [item.id]: null }));
    setReviewedCount((count) => count + 1);
    const remaining = items.filter((candidate) => candidate.id !== item.id);
    setItems(remaining);
    setChangesPanelOpenId(null);
    announce(`Changes requested for "${item.title}".`);
    advanceFrom(remaining, item.id);
  }

  function openRejectDialog(item: ReviewQueueItem) {
    setRejectDialogId(item.id);
    setRejectReason("");
    setRejectError(null);
  }

  function confirmReject() {
    const item = items.find((candidate) => candidate.id === rejectDialogId);
    if (!item) return;
    const reason = rejectReason.trim();
    if (reason.length === 0) {
      setRejectError("A reason is required.");
      return;
    }
    setReviewedCount((count) => count + 1);
    const remaining = items.filter((candidate) => candidate.id !== item.id);
    setItems(remaining);
    setRejectDialogId(null);
    announce(`"${item.title}" rejected.`);
    advanceFrom(remaining, item.id);
  }

  // Keyboard shortcuts (§5.5): a approve, r request changes, j/k navigate.
  // Inert while typing in a field, while the reject dialog is open, or with
  // a modifier held (so browser/OS shortcuts still work).
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (rejectDialogId) {
        if (event.key === "Escape") setRejectDialogId(null);
        return;
      }

      if (isTypingTarget(event.target)) return;
      if (!selectedItem) return;

      const currentIndex = items.findIndex((item) => item.id === selectedItem.id);

      if (event.key === "j") {
        event.preventDefault();
        const next = items[currentIndex + 1];
        if (next) selectItem(next.id);
      } else if (event.key === "k") {
        event.preventDefault();
        const prev = items[currentIndex - 1];
        if (prev) selectItem(prev.id);
      } else if (event.key === "a") {
        event.preventDefault();
        if (!approveDisabledReason(selectedItem)) handleApprove(selectedItem);
      } else if (event.key === "r") {
        event.preventDefault();
        setChangesPanelOpenId(selectedItem.id);
        requestAnimationFrame(() => notesRef.current?.focus());
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handlers close over items/selectedItem/awaitingSecond/etc. captured fresh every render via this effect re-subscribing on every state change below.
  }, [items, selectedItem, rejectDialogId, tierTwoVerified, awaitingSecond, firstApprovedBy]);

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface px-4 py-2 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <ClockIcon size={13} />
          Session total <span className="font-medium tabular-nums text-foreground">{formatElapsed(now - sessionStart)}</span>
        </span>
        <span>
          {reviewedCount} action{reviewedCount === 1 ? "" : "s"} taken this session
        </span>
      </div>

      <div className="lg:flex lg:items-start">
        <aside className="border-b border-line bg-surface lg:h-[calc(100dvh-88px)] lg:w-72 lg:shrink-0 lg:overflow-y-auto lg:border-r lg:border-b-0">
          <div className="border-b border-line px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground">Queue</h2>
            <p className="text-xs text-muted">
              {items.length} item{items.length === 1 ? "" : "s"} awaiting review, oldest first
            </p>
          </div>
          {items.length === 0 ? (
            <p className="p-4 text-sm text-muted">Nothing waiting.</p>
          ) : (
            groupedItems.map((group) => (
              <div key={group.id}>
                <p className="sticky top-0 bg-surface px-4 py-1.5 text-[11px] font-semibold tracking-wide text-muted uppercase">
                  {group.label}
                </p>
                <ul>
                  {group.items.map((item) => {
                    const active = item.id === selectedId;
                    const KindIcon = kindIcon(item.kind);
                    const elapsedMs = now - new Date(item.submittedAt).getTime();
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => selectItem(item.id)}
                          aria-current={active ? "true" : undefined}
                          className={`flex w-full cursor-pointer items-start gap-2 border-l-2 px-4 py-2.5 text-left transition-colors duration-200 ${
                            active ? "border-primary bg-primary/5" : "border-transparent hover:bg-line/40"
                          }`}
                        >
                          <KindIcon size={15} className="mt-0.5 shrink-0 text-muted" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-foreground">{item.title}</span>
                            <span className="mt-1 flex flex-wrap items-center gap-1.5">
                              <span className="rounded-control bg-line px-1.5 py-0.5 text-[10px] font-medium text-muted">
                                {verticalLabel(item.vertical)}
                              </span>
                              {item.sourceTier && (
                                <span
                                  className={`rounded-control px-1.5 py-0.5 text-[10px] font-medium ${tierBadgeClasses(item.sourceTier)}`}
                                >
                                  Tier {item.sourceTier}
                                </span>
                              )}
                              {awaitingSecond[item.id] && (
                                <span className="rounded-control bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                                  Awaiting 2nd
                                </span>
                              )}
                            </span>
                          </span>
                          <span className="shrink-0 text-right text-[11px] tabular-nums text-muted">
                            {formatElapsed(elapsedMs)}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </aside>

        <div className="min-w-0 flex-1 lg:h-[calc(100dvh-88px)] lg:overflow-y-auto">
          {!selectedItem ? (
            <div className="flex flex-col items-center gap-2 px-4 py-16 text-center">
              <CircleCheckBigIcon size={32} className="text-success" />
              <p className="font-heading text-lg font-medium text-foreground">Queue clear</p>
              <p className="max-w-sm text-sm text-muted">
                {reviewedCount > 0
                  ? `${reviewedCount} action${reviewedCount === 1 ? "" : "s"} taken in ${formatElapsed(now - sessionStart)} this session.`
                  : "Nothing is waiting for review right now."}
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2 border-b border-line bg-surface px-4 py-2 text-xs text-muted">
                <span>
                  Opened{" "}
                  <span className="font-medium tabular-nums text-foreground">
                    {formatElapsed(now - (openedAt[selectedItem.id] ?? now))}
                  </span>{" "}
                  ago
                </span>
                <span className="hidden sm:inline">
                  Submitted {formatElapsed(now - new Date(selectedItem.submittedAt).getTime())} ago
                </span>
              </div>

              {selectedItem.requiresSecondApproval && (
                <div className="flex items-start gap-2 border-b border-line bg-accent/10 px-4 py-2.5 text-sm text-foreground">
                  <TriangleAlertIcon size={16} className="mt-0.5 shrink-0 text-accent" />
                  <div>
                    <p className="font-medium">Second reviewer required</p>
                    <p className="text-xs text-muted">
                      {awaitingSecond[selectedItem.id]
                        ? "First approval recorded. This item stays queued until a second reviewer approves it."
                        : "Health and finance content needs two separate approvals before it can publish."}
                    </p>
                  </div>
                </div>
              )}

              <div className="grid gap-4 p-4 xl:grid-cols-2">
                <DraftPane
                  item={selectedItem}
                  editing={editingDraft}
                  onToggleEdit={() => setEditingDraft((value) => !value)}
                  onChangeTitle={(title) => updateSelectedDraft({ title })}
                  onChangeBody={(bodyMd) => updateSelectedDraft({ bodyMd })}
                />
                <SourcePane item={selectedItem} source={selectedItem.sourceId ? sourceMap.get(selectedItem.sourceId) : undefined} />
              </div>

              {selectedItem.tierTwoVerificationRequired && (
                <div className="px-4 pb-3">
                  <label className="flex cursor-pointer items-start gap-2 rounded-control border border-line bg-background px-3 py-2.5 text-sm">
                    <input
                      type="checkbox"
                      checked={!!tierTwoVerified[selectedItem.id]}
                      onChange={(event) =>
                        setTierTwoVerified((prev) => ({ ...prev, [selectedItem.id]: event.target.checked }))
                      }
                      className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-primary"
                    />
                    <span>
                      I verified against the primary source.{" "}
                      <span className="text-muted">Required for tier-2 sources before you can approve.</span>
                    </span>
                  </label>
                </div>
              )}

              <div className="sticky bottom-0 border-t border-line bg-surface">
                <div className="flex flex-wrap items-center gap-2 px-4 py-3">
                  <button
                    type="button"
                    disabled={!!approveDisabledReason(selectedItem)}
                    onClick={() => handleApprove(selectedItem)}
                    title={approveDisabledReason(selectedItem) ?? undefined}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-control bg-success px-3 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <CheckIcon size={15} />
                    Approve
                    <kbd className="rounded border border-white/30 px-1 text-[10px] font-normal">A</kbd>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setChangesPanelOpenId(selectedItem.id);
                      requestAnimationFrame(() => notesRef.current?.focus());
                    }}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-control border border-line bg-background px-3 py-2 text-sm font-semibold text-foreground transition-colors duration-200 hover:border-primary hover:text-primary"
                  >
                    <PencilIcon size={15} />
                    Request changes
                    <kbd className="rounded border border-line px-1 text-[10px] font-normal text-muted">R</kbd>
                  </button>
                  <button
                    type="button"
                    onClick={() => openRejectDialog(selectedItem)}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-control border border-danger/40 px-3 py-2 text-sm font-semibold text-danger transition-colors duration-200 hover:bg-danger/10"
                  >
                    <XIcon size={15} />
                    Reject
                  </button>
                  <span className="ml-auto hidden items-center gap-1 text-xs text-muted sm:inline-flex">
                    <kbd className="rounded border border-line px-1 text-[10px]">J</kbd>/
                    <kbd className="rounded border border-line px-1 text-[10px]">K</kbd> navigate
                  </span>
                </div>

                {changesPanelOpenId === selectedItem.id && (
                  <div className="border-t border-line bg-background px-4 py-3">
                    <label htmlFor="changes-notes" className="mb-1 block text-xs font-medium text-muted">
                      What needs to change? (minimum 10 characters)
                    </label>
                    <textarea
                      id="changes-notes"
                      ref={notesRef}
                      rows={3}
                      value={notesDrafts[selectedItem.id] ?? ""}
                      onChange={(event) =>
                        setNotesDrafts((prev) => ({ ...prev, [selectedItem.id]: event.target.value }))
                      }
                      aria-invalid={!!notesErrors[selectedItem.id]}
                      aria-describedby={notesErrors[selectedItem.id] ? "changes-notes-error" : undefined}
                      className={inputClass}
                    />
                    {notesErrors[selectedItem.id] && (
                      <p id="changes-notes-error" className="mt-1 text-xs text-danger">
                        {notesErrors[selectedItem.id]}
                      </p>
                    )}
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleRequestChangesSubmit(selectedItem)}
                        className="cursor-pointer rounded-control bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary transition-colors duration-200 hover:bg-primary-hover"
                      >
                        Send
                      </button>
                      <button
                        type="button"
                        onClick={() => setChangesPanelOpenId(null)}
                        className="cursor-pointer rounded-control px-3 py-1.5 text-xs font-medium text-muted transition-colors duration-200 hover:text-foreground"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {rejectDialogId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reject-dialog-title"
          onClick={() => setRejectDialogId(null)}
        >
          <div
            className="w-full max-w-sm rounded-card border border-line bg-surface p-5 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="reject-dialog-title" className="font-heading text-base font-semibold text-foreground">
              Reject this item?
            </h2>
            <p className="mt-1 text-sm text-muted">
              This archives the draft. Give a reason so the next redraft can address it.
            </p>
            <label htmlFor="reject-reason" className="mt-3 block text-xs font-medium text-muted">
              Reason
            </label>
            <textarea
              id="reject-reason"
              rows={3}
              autoFocus
              value={rejectReason}
              onChange={(event) => setRejectReason(event.target.value)}
              className={`mt-1 ${inputClass}`}
            />
            {rejectError && <p className="mt-1 text-xs text-danger">{rejectError}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejectDialogId(null)}
                className="cursor-pointer rounded-control px-3 py-1.5 text-sm font-medium text-muted transition-colors duration-200 hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmReject}
                className="cursor-pointer rounded-control bg-danger px-3 py-1.5 text-sm font-semibold text-white transition-colors duration-200 hover:opacity-90"
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div
          role="status"
          className="fixed right-4 bottom-4 z-50 max-w-xs rounded-control border border-success/30 bg-success/10 px-4 py-2.5 text-sm font-medium text-success shadow-lg"
        >
          {toast}
        </div>
      )}
    </div>
  );
}

function DraftPane({
  item,
  editing,
  onToggleEdit,
  onChangeTitle,
  onChangeBody,
}: {
  item: ReviewQueueItem;
  editing: boolean;
  onToggleEdit: () => void;
  onChangeTitle: (title: string) => void;
  onChangeBody: (bodyMd: string) => void;
}) {
  const { before, code, after } = splitFencedBlock(item.bodyMd);

  return (
    <section aria-labelledby="draft-heading" className="rounded-card border border-line bg-surface">
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <h2 id="draft-heading" className="text-sm font-semibold text-foreground">
          Draft
        </h2>
        <button
          type="button"
          onClick={onToggleEdit}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-control border border-line px-2.5 py-1 text-xs font-medium text-muted transition-colors duration-200 hover:border-primary hover:text-primary"
        >
          {editing ? (
            <>
              <EyeIcon size={13} /> Preview
            </>
          ) : (
            <>
              <PencilIcon size={13} /> Edit
            </>
          )}
        </button>
      </div>

      <div className="p-4">
        {editing ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <div>
                <label htmlFor="draft-title" className="mb-1 block text-xs font-medium text-muted">
                  Title
                </label>
                <input
                  id="draft-title"
                  value={item.title}
                  onChange={(event) => onChangeTitle(event.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="draft-body" className="mb-1 block text-xs font-medium text-muted">
                  Body (markdown)
                </label>
                <textarea
                  id="draft-body"
                  rows={14}
                  value={item.bodyMd}
                  onChange={(event) => onChangeBody(event.target.value)}
                  className={`${inputClass} font-mono text-xs leading-relaxed`}
                />
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium text-muted">Live preview</p>
              <div className="rounded-control border border-dashed border-line p-3">
                <h3 className="font-heading text-base font-semibold text-foreground">{item.title}</h3>
                <Prose text={item.bodyMd} className="mt-2 space-y-3 text-sm leading-relaxed text-foreground" />
              </div>
            </div>
          </div>
        ) : (
          <div>
            <h3 className="font-heading text-lg font-semibold text-foreground">{item.title}</h3>
            <p className="mt-1 text-sm text-muted">{item.summary}</p>
            <Prose text={before} className="mt-4 max-w-prose space-y-3 text-sm leading-relaxed text-foreground" />
            {code && (
              <pre className="mt-3 overflow-x-auto rounded-control border border-line bg-background px-3 py-3 text-xs leading-relaxed text-foreground">
                <code>{code}</code>
              </pre>
            )}
            {after && (
              <Prose text={after} className="mt-3 max-w-prose space-y-3 text-sm leading-relaxed text-foreground" />
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function SourcePane({ item, source }: { item: ReviewQueueItem; source: ContentSource | undefined }) {
  return (
    <section aria-labelledby="source-heading" className="rounded-card border border-line bg-surface">
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <h2 id="source-heading" className="text-sm font-semibold text-foreground">
          Primary source
        </h2>
        {item.sourceTier && (
          <span className={`rounded-control px-2 py-0.5 text-[11px] font-medium ${tierBadgeClasses(item.sourceTier)}`}>
            Tier {item.sourceTier}
          </span>
        )}
      </div>
      <div className="p-4">
        {item.sourceUrl ? (
          <>
            <p className="text-sm font-medium text-foreground">{source?.name ?? "Unknown source"}</p>
            <a
              href={item.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-control bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary transition-colors duration-200 hover:bg-primary-hover"
            >
              <ExternalLinkIcon size={13} />
              Open primary source
            </a>
            {item.sourceExcerpt && (
              <blockquote className="mt-4 border-l-2 border-line pl-3 text-sm leading-relaxed text-muted italic">
                &ldquo;{item.sourceExcerpt}&rdquo;
              </blockquote>
            )}
          </>
        ) : (
          <p className="text-sm text-muted">
            No external primary source for this item — it wasn&apos;t drafted from a single news article.
          </p>
        )}
      </div>
    </section>
  );
}
