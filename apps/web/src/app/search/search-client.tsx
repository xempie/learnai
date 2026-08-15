"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ComponentType } from "react";
import {
  type IconProps,
  MessageSquareIcon,
  NewspaperIcon,
  SearchIcon,
  VideoIcon,
  Wand2Icon,
  XIcon,
} from "@/components/icons";
import type { ContentItem, ContentKind, Prompt, Vertical } from "@/lib/sample-data";
import { verticalLabel } from "@/lib/verticals";

const SUGGESTIONS = ["verification", "meeting transcript", "rubric", "campaign brief", "one-on-one", "policy"];

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

type ResultKind = ContentKind;

interface SearchResult {
  kind: ResultKind;
  id: string;
  title: string;
  summary: string;
  href: string;
  vertical: Vertical;
  score: number;
}

const KIND_META: Record<ResultKind, { label: string; Icon: ComponentType<IconProps> }> = {
  news: { label: "News", Icon: NewspaperIcon },
  technique: { label: "Techniques", Icon: Wand2Icon },
  video: { label: "Videos", Icon: VideoIcon },
  prompt: { label: "Prompts", Icon: MessageSquareIcon },
};

const KIND_ORDER: ResultKind[] = ["news", "technique", "video", "prompt"];

/** Simple ranked-ish scoring: exact/prefix title matches outrank a body-only match. */
function scoreMatch(query: string, title: string, body: string): number {
  const q = query.toLowerCase();
  const t = title.toLowerCase();
  let score = 0;
  if (t === q) score += 100;
  else if (t.startsWith(q)) score += 60;
  else if (t.includes(q)) score += 30;
  if (body.toLowerCase().includes(q)) score += 10;
  return score;
}

export function SearchClient({ items, prompts }: { items: ContentItem[]; prompts: Prompt[] }) {
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query.trim(), 250);

  const results = useMemo<SearchResult[]>(() => {
    if (debounced.length < 2) return [];
    const out: SearchResult[] = [];
    for (const item of items) {
      const score = scoreMatch(debounced, item.title, `${item.summary} ${item.bodyMd}`);
      if (score > 0) {
        out.push({
          kind: item.kind,
          id: item.id,
          title: item.title,
          summary: item.summary,
          href: `/content/${item.slug}`,
          vertical: item.vertical,
          score,
        });
      }
    }
    for (const prompt of prompts) {
      const score = scoreMatch(debounced, prompt.title, prompt.body);
      if (score > 0) {
        out.push({
          kind: "prompt",
          id: prompt.id,
          title: prompt.title,
          summary: prompt.body,
          href: `/prompts#${prompt.id}`,
          vertical: prompt.vertical,
          score,
        });
      }
    }
    return out.sort((a, b) => b.score - a.score);
  }, [debounced, items, prompts]);

  const grouped = useMemo(() => {
    const map = new Map<ResultKind, SearchResult[]>();
    for (const result of results) {
      const list = map.get(result.kind) ?? [];
      list.push(result);
      map.set(result.kind, list);
    }
    return map;
  }, [results]);

  const showingSuggestions = debounced.length < 2;

  return (
    <div>
      <div className="relative">
        <SearchIcon size={18} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search news, techniques, videos, prompts…"
          aria-label="Search Learn AI content"
          autoFocus
          className="w-full rounded-control border border-line bg-surface py-3 pr-10 pl-10 text-[15px] text-foreground placeholder:text-muted focus:border-primary focus:outline-none"
        />
        {query.length > 0 && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="absolute top-1/2 right-3 -translate-y-1/2 cursor-pointer rounded-control p-1 text-muted transition-colors duration-200 hover:text-foreground"
          >
            <XIcon size={16} />
          </button>
        )}
      </div>

      <p className="mt-2 text-xs text-muted" aria-live="polite">
        {showingSuggestions ? "" : `${results.length} result${results.length === 1 ? "" : "s"} for "${debounced}"`}
      </p>

      <div className="mt-6">
        {showingSuggestions ? (
          <div className="rounded-card border border-dashed border-line bg-surface p-6">
            <p className="text-sm font-medium text-foreground">Try searching for…</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => setQuery(suggestion)}
                  className="cursor-pointer rounded-full border border-line bg-background px-3 py-1.5 text-sm text-foreground transition-colors duration-200 hover:border-primary hover:text-primary"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : results.length === 0 ? (
          <div className="rounded-card border border-dashed border-line bg-surface p-8 text-center">
            <p className="font-heading text-lg font-medium text-foreground">No results for &ldquo;{debounced}&rdquo;</p>
            <p className="mt-1 text-sm text-muted">Try a shorter or different search term.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {KIND_ORDER.filter((kind) => grouped.has(kind)).map((kind) => {
              const meta = KIND_META[kind];
              const kindResults = grouped.get(kind)!;
              return (
                <section key={kind}>
                  <h2 className="mb-2 inline-flex items-center gap-1.5 text-sm font-semibold tracking-wide text-muted uppercase">
                    <meta.Icon size={14} />
                    {meta.label}
                  </h2>
                  <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
                    {kindResults.map((result) => (
                      <li key={result.id}>
                        <Link
                          href={result.href}
                          className="block cursor-pointer px-4 py-3 transition-colors duration-200 hover:bg-line/40"
                        >
                          <p className="font-heading text-[1.05rem] font-medium text-foreground">{result.title}</p>
                          <p className="mt-0.5 line-clamp-2 text-sm text-muted">{result.summary}</p>
                          <p className="mt-1 text-xs text-muted">{verticalLabel(result.vertical)}</p>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
