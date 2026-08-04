"use client";

import { Check, Clock3 } from "lucide-react";
import { formatClock } from "@/components/content-card";
import { MarkdownBody } from "@/components/markdown-body";
import { VideoPlayer } from "@/components/video-player";

/**
 * "Why take this topic" - the free intro video plus the two pieces of
 * copy that sell the topic: `why_learn` (prose) and `outcomes` (a list of
 * what the learner walks away with).
 *
 * The intro needs no entitlement, so this renders identically for a signed
 * out visitor, a trial account and a subscriber. When a topic has no intro
 * video the text stands on its own rather than framing an empty player.
 */

export interface TopicIntroProps {
  topicId: string;
  /** False, or absent from the API, means "text only". */
  hasIntro?: boolean;
  introDurationSec?: number | null;
  whyLearn?: string | null;
  outcomes?: string | null;
  posterUrl?: string | null;
}

/**
 * Outcomes are authored as a markdown bullet list. Pulling the bullets out
 * lets each one render as a tick rather than a disc. Anything that is not a
 * bullet (a lead-in sentence, say) is kept and rendered as prose above the
 * list, so no authored text is silently dropped.
 */
function splitOutcomes(source: string): { intro: string; items: string[] } {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const items: string[] = [];
  const rest: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^[-*]\s+/.test(trimmed)) {
      items.push(trimmed.replace(/^[-*]\s+/, "").trim());
    } else {
      rest.push(line);
    }
  }

  return { intro: rest.join("\n").trim(), items };
}

export function TopicIntro({
  topicId,
  hasIntro = false,
  introDurationSec,
  whyLearn,
  outcomes,
  posterUrl,
}: TopicIntroProps) {
  const why = whyLearn?.trim() ?? "";
  const outcomeSource = outcomes?.trim() ?? "";
  const parsed = outcomeSource ? splitOutcomes(outcomeSource) : null;

  // Nothing authored yet - render nothing rather than an empty shell.
  if (!hasIntro && !why && !outcomeSource) return null;

  return (
    <section
      aria-labelledby="topic-intro-heading"
      className="rounded-card border border-line bg-surface p-5 shadow-xs sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="topic-intro-heading" className="text-lg font-semibold text-ink">
          Why take this topic
        </h2>
        {hasIntro && typeof introDurationSec === "number" && introDurationSec > 0 && (
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-faint">
            <Clock3 className="size-4" aria-hidden="true" />
            {formatClock(introDurationSec)} intro
          </span>
        )}
      </div>

      {hasIntro && (
        <div className="mt-4">
          <VideoPlayer
            mode="intro"
            topicId={topicId}
            durationSec={introDurationSec}
            posterUrl={posterUrl}
          />
          <p className="mt-2 text-sm text-ink-faint">
            Free to watch - no subscription needed.
          </p>
        </div>
      )}

      {why && <MarkdownBody source={why} className="mt-4" />}

      {parsed && (parsed.items.length > 0 || parsed.intro) && (
        <div className="mt-5">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-faint">
            What you will be able to do
          </h3>
          {parsed.intro && <MarkdownBody source={parsed.intro} className="mt-2" />}
          {parsed.items.length > 0 && (
            <ul className="mt-3 flex flex-col gap-2.5">
              {parsed.items.map((item, index) => (
                <li key={`${index}-${item.slice(0, 24)}`} className="flex items-start gap-2.5">
                  <span
                    aria-hidden="true"
                    className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-success-soft"
                  >
                    <Check className="size-3.5 text-success" />
                  </span>
                  <span className="min-w-0 leading-relaxed text-ink-muted">{item}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
