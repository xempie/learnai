import { slugify } from "@learn-ai/db";
import type { LlmClient, LlmMessage } from "@learn-ai/llm";
import { DRAFT_SYSTEM_PROMPT } from "../prompts/draft-prompt.js";
import { DraftValidationError } from "./errors.js";
import {
  DraftRefusalSchema,
  DraftSuccessSchema,
  DraftSuccessShapeSchema,
  SUMMARY_MAX_LENGTH,
} from "./schema.js";
import type { DraftItemInput, DraftKind, DraftResult } from "./types.js";

/**
 * Generous per-kind token budgets (§5.3's word counts: news 80-120,
 * technique 200-300 + a fenced prompt block, video a 4-6 minute script with
 * timestamped sections) padded well above the target so the model never
 * gets truncated mid-JSON — the §3.3 `summary`/`body_md` fields plus JSON
 * punctuation overhead are small relative to these budgets.
 */
const MAX_TOKENS_BY_KIND: Record<DraftKind, number> = {
  news: 700,
  technique: 1400,
  video: 2200,
};

const MAX_REGENERATE_ATTEMPTS = 2; // initial attempt + exactly one regenerate

/**
 * §5.3 draft agent / §12 T10: writes one `content_items`-shaped draft (or a
 * typed `insufficient_source` refusal) for one selected candidate in one
 * requested `kind`. `client` is expected to come from `@learn-ai/llm`'s
 * `createLlmClient({ agentName: 'draft', pool, executionArn? })`, so every
 * draft call's cost/tokens land in `agent_runs` (§3.7) for free — and,
 * per the small T08-compatible `LlmResponse.agentRunId` addition, so the
 * returned item can carry `agent_run_id` straight through to the INSERT.
 *
 * Slug uniqueness is deliberately NOT resolved here: `draftItem` runs once
 * per candidate (§5.1's `DraftAgent` is a `Map over selected`, so a single
 * call never sees its sibling items), and only `persistDrafts` — which
 * holds the DB pool and inserts the whole batch — has the visibility
 * needed to dedupe a slug against both its siblings and existing rows.
 * `draftItem` produces the plain `slugify(title)` base slug; `persistDrafts`
 * appends a numeric suffix on collision.
 */
export async function draftItem(input: DraftItemInput, client: LlmClient): Promise<DraftResult> {
  const userMessage = buildUserMessage(input);
  const messages: LlmMessage[] = [{ role: "user", content: userMessage }];
  const maxTokens = MAX_TOKENS_BY_KIND[input.kind];

  const response = await client.complete({
    system: DRAFT_SYSTEM_PROMPT,
    messages,
    maxTokens,
    responseFormat: "json",
  });

  return resolveResponse(response.text, {
    input,
    client,
    userMessage,
    maxTokens,
    attempt: 1,
    agentRunId: response.agentRunId,
  });
}

interface ResolveContext {
  input: DraftItemInput;
  client: LlmClient;
  userMessage: string;
  maxTokens: number;
  attempt: number;
  /** The agent_run_id of the LAST attempt made — a regenerate re-asks the
   * model, so the item ultimately persisted is attributed to whichever
   * call actually produced the accepted text. */
  agentRunId: string;
}

async function resolveResponse(text: string, ctx: ResolveContext): Promise<DraftResult> {
  // BaseLlmClient already guarantees `text` parses as JSON for
  // responseFormat:'json' (or throws before returning) — this parse is not
  // expected to throw.
  const parsed: unknown = JSON.parse(text);

  const refusal = DraftRefusalSchema.safeParse(parsed);
  if (refusal.success) {
    return { ok: false, error: "insufficient_source", detail: refusal.data.detail };
  }

  const shapeResult = DraftSuccessShapeSchema.safeParse(parsed);
  const invalidShape = !shapeResult.success;
  const summaryLength = shapeResult.success ? shapeResult.data.summary.length : undefined;
  const tooLong = summaryLength !== undefined && summaryLength > SUMMARY_MAX_LENGTH;

  if ((invalidShape || tooLong) && ctx.attempt < MAX_REGENERATE_ATTEMPTS) {
    const correction = tooLong
      ? `Your previous "summary" field was ${summaryLength} characters — ` +
        `it must be <=${SUMMARY_MAX_LENGTH} characters. Respond again with ONLY the JSON object ` +
        `for the same item, "summary" shortened to <=${SUMMARY_MAX_LENGTH} characters, every ` +
        `other field unchanged.`
      : `Your previous response was not the exact JSON shape requested. Respond again with ` +
        `ONLY JSON, no markdown fences, either ` +
        `{"title":"...","summary":"<=200 chars","body_md":"...","vertical":"...","source_url":"..."} ` +
        `or {"error":"insufficient_source","detail":"<what is missing>"}.`;

    const retryResponse = await ctx.client.complete({
      system: DRAFT_SYSTEM_PROMPT,
      messages: [
        { role: "user", content: ctx.userMessage },
        { role: "assistant", content: text },
        { role: "user", content: correction },
      ],
      maxTokens: ctx.maxTokens,
      responseFormat: "json",
    });

    return resolveResponse(retryResponse.text, {
      ...ctx,
      attempt: ctx.attempt + 1,
      agentRunId: retryResponse.agentRunId,
    });
  }

  if (invalidShape) {
    throw new DraftValidationError(
      "Draft response did not match the required JSON shape after one regenerate attempt",
      text,
    );
  }
  if (tooLong) {
    throw new DraftValidationError(
      `Draft "summary" was still >200 characters after one regenerate attempt`,
      text,
    );
  }

  // Neither invalid nor too-long — the full success schema (shape + <=200
  // length) is guaranteed to parse; re-run it to get the length-narrowed type.
  const data = DraftSuccessSchema.parse(parsed);
  const { candidate, kind } = ctx.input;

  return {
    ok: true,
    item: {
      title: data.title,
      slug: slugify(data.title),
      summary: data.summary,
      bodyMd: data.body_md,
      vertical: data.vertical,
      kind,
      sourceUrl: data.source_url,
      sourceId: candidate.sourceId,
      sourceTier: candidate.sourceTier,
      status: "in_review",
      authorKind: "agent",
      agentRunId: ctx.agentRunId,
      isPremium: false,
      videoUrl: null,
    },
  };
}

function buildUserMessage(input: DraftItemInput): string {
  const { candidate, kind, reviewerNotes } = input;
  const payload = {
    kind,
    title: candidate.title,
    url: candidate.url,
    excerpt: candidate.excerpt,
    raw: candidate.raw ?? null,
  };
  const message = JSON.stringify(payload);
  return reviewerNotes ? `${message}\n\nReviewer requested changes: ${reviewerNotes}` : message;
}
