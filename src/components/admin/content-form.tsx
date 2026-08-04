"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Info, Plus, TriangleAlert, X } from "lucide-react";
import { api } from "@/lib/api-client";
import {
  BTN_PRIMARY,
  BTN_SECONDARY,
  CARD,
  ErrorBox,
  FIELD,
  ICON_BTN,
  LABEL,
  PageHeader,
  SectionCard,
  SkeletonRows,
  TEXTAREA,
  errorMessage,
  slugify,
  useAsync,
  type TopicType,
  type SkillLevel,
} from "./admin-ui";

interface AdminCategory {
  id: string;
  slug: string;
  name: string;
  color_hex: string | null;
  is_active: boolean;
  topic_count: number;
}

interface CreatedTopic {
  id: string;
  slug: string;
  title: string;
}

const MAX_LINKS = 10;

interface LinkRow {
  key: string;
  label: string;
  url: string;
}

let rowSeq = 0;
const nextRowKey = () => `row-${(rowSeq += 1)}`;

export function ContentForm() {
  const router = useRouter();

  const categories = useAsync<{ data: AdminCategory[] }>("admin-categories", () =>
    api.get<{ data: AdminCategory[] }>("/admin/categories"),
  );

  const [type, setType] = useState<TopicType>("topic");
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [body, setBody] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [excerptTouched, setExcerptTouched] = useState(false);
  const [skillLevel, setSkillLevel] = useState<SkillLevel>("basic");
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [hashtagDraft, setHashtagDraft] = useState("");
  const [links, setLinks] = useState<LinkRow[]>([{ key: nextRowKey(), label: "", url: "" }]);
  const [isFree, setIsFree] = useState(false);
  const [affiliateTool, setAffiliateTool] = useState("");
  const [affiliateUrl, setAffiliateUrl] = useState("");
  const [isSponsored, setIsSponsored] = useState(false);
  const [sponsorName, setSponsorName] = useState("");

  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const derivedSlug = slugify(title);

  const errors = useMemo(() => {
    const list: string[] = [];
    if (title.trim().length < 3) list.push("A title of at least 3 characters is required.");
    if (type === "article" && !body.trim()) list.push("Article body is required.");
    if (categoryIds.length === 0) list.push("Pick at least one category.");
    if (categoryIds.length > 5) list.push("A topic may have at most 5 categories.");
    return list;
  }, [title, type, body, categoryIds.length]);

  const disclosurePreview = useMemo(() => {
    const parts: string[] = [];
    if (isSponsored) parts.push(`Sponsored by ${sponsorName.trim() || "[sponsor name]"}.`);
    if (affiliateTool.trim() || affiliateUrl.trim()) {
      parts.push(
        `Contains an affiliate link to ${affiliateTool.trim() || "[tool name]"} - we may earn a commission at no cost to you.`,
      );
    }
    return parts.join(" ");
  }, [isSponsored, sponsorName, affiliateTool, affiliateUrl]);

  function onBodyChange(value: string) {
    setBody(value);
    if (!excerptTouched) {
      setExcerpt(value.replace(/\s+/g, " ").trim().slice(0, 160));
    }
  }

  function toggleCategory(id: string) {
    setCategoryIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  }

  function commitHashtags(raw: string) {
    const parts = raw
      .split(",")
      .map((p) => p.trim().replace(/^#+/, "").toLowerCase())
      .filter(Boolean);
    if (parts.length === 0) return;
    setHashtags((prev) => Array.from(new Set([...prev, ...parts])));
    setHashtagDraft("");
  }

  async function createDraft() {
    setAttempted(true);
    if (errors.length > 0) {
      setSaveError("");
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      const created = await api.post<CreatedTopic>("/admin/topics", {
        type,
        title: title.trim(),
        subtitle: subtitle.trim() === "" ? null : subtitle.trim(),
        body: body.trim() === "" ? null : body,
        excerpt: excerpt.trim() === "" ? null : excerpt.trim(),
        skillLevel,
        categoryIds,
        hashtags,
        links: links
          .filter((l) => l.url.trim() !== "")
          .map((l) => ({
            url: l.url.trim(),
            label: l.label.trim() === "" ? null : l.label.trim(),
          })),
        isFree,
        affiliateTool: affiliateTool.trim() === "" ? null : affiliateTool.trim(),
        affiliateUrl: affiliateUrl.trim() === "" ? null : affiliateUrl.trim(),
        isSponsored,
        sponsorName: sponsorName.trim() === "" ? null : sponsorName.trim(),
      });
      // Episodes, video, captions and the cover image all live in the editor.
      router.push(`/admin/topics/${created.id}`);
    } catch (err) {
      setSaveError(errorMessage(err));
      setSaving(false);
    }
  }

  const showErrors = attempted && errors.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="New content"
        description="This creates a draft. Episodes, video, captions and the cover image are added in the topic editor on the next screen."
      />

      {/* ===== Type ===== */}
      <SectionCard
        id="type"
        title="Content type"
        description="Topics and articles share one content model - the type only changes which fields apply."
      >
        <div role="group" aria-label="Content type" className="flex flex-wrap gap-2">
          {(
            [
              { value: "topic", label: "Topic" },
              { value: "article", label: "Article" },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setType(option.value)}
              aria-pressed={type === option.value}
              className={`min-h-12 rounded-md border px-6 font-semibold transition-colors ${
                type === option.value
                  ? "border-primary bg-primary-soft text-primary-strong"
                  : "border-line text-ink-muted hover:border-line-strong"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </SectionCard>

      {/* ===== Basics ===== */}
      <SectionCard id="basics" title="Basics">
        <div className="flex flex-col gap-5">
          <div>
            <label htmlFor="cf-title" className={LABEL}>
              Title <span className="text-danger">*</span>
            </label>
            <input
              id="cf-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              aria-describedby="cf-title-hint"
              className={`${FIELD} mt-1.5`}
            />
            <p id="cf-title-hint" className="mt-1 text-xs text-ink-faint">
              {title.length}/200 characters. The slug is generated from the title as{" "}
              <code className="text-ink-muted">/{derivedSlug || "..."}</code> and can be changed in
              the editor.
            </p>
          </div>

          <div>
            <label htmlFor="cf-subtitle" className={LABEL}>
              Subtitle
            </label>
            <input
              id="cf-subtitle"
              type="text"
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              className={`${FIELD} mt-1.5`}
            />
          </div>

          <div>
            <label htmlFor="cf-body" className={LABEL}>
              {type === "article" ? (
                <>
                  Body (markdown) <span className="text-danger">*</span>
                </>
              ) : (
                "Description (markdown, optional)"
              )}
            </label>
            <textarea
              id="cf-body"
              value={body}
              onChange={(e) => onBodyChange(e.target.value)}
              rows={type === "article" ? 12 : 5}
              aria-describedby="cf-body-hint"
              className={`${TEXTAREA} mt-1.5 font-mono`}
            />
            <p id="cf-body-hint" className="mt-1 text-xs text-ink-faint">
              {body.length} characters · markdown supported (**bold**, ### headings, lists)
            </p>
          </div>

          <div>
            <label htmlFor="cf-excerpt" className={LABEL}>
              Excerpt
            </label>
            <input
              id="cf-excerpt"
              type="text"
              value={excerpt}
              onChange={(e) => {
                setExcerptTouched(true);
                setExcerpt(e.target.value);
              }}
              maxLength={500}
              aria-describedby="cf-excerpt-hint"
              className={`${FIELD} mt-1.5`}
            />
            <p id="cf-excerpt-hint" className="mt-1 text-xs text-ink-faint">
              Auto-filled from the first 160 characters of the body until you edit it.{" "}
              {excerpt.length}/500.
            </p>
          </div>

          <div className="max-w-xs">
            <label htmlFor="cf-level" className={LABEL}>
              Skill level
            </label>
            <select
              id="cf-level"
              value={skillLevel}
              onChange={(e) => setSkillLevel(e.target.value as SkillLevel)}
              className={`${FIELD} mt-1.5`}
            >
              <option value="basic">Basic</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </select>
          </div>

          <label className="flex min-h-12 w-fit cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={isFree}
              onChange={(e) => setIsFree(e.target.checked)}
              className="size-5 accent-[var(--color-primary)]"
            />
            <span className="text-sm font-semibold">
              Free content - viewable without a subscription
            </span>
          </label>
        </div>
      </SectionCard>

      {/* ===== Categories ===== */}
      <SectionCard
        id="categories"
        title="Categories"
        description="At least one, up to five. Items in two categories appear in both feeds."
      >
        {categories.error ? (
          <ErrorBox message={categories.error} onRetry={categories.reload} />
        ) : categories.loading ? (
          <SkeletonRows rows={3} />
        ) : (categories.data?.data.length ?? 0) === 0 ? (
          <p className="text-sm text-ink-muted">
            No categories exist yet.{" "}
            <Link
              href="/admin/categories"
              className="font-semibold text-primary-strong underline underline-offset-2"
            >
              Create one first
            </Link>
            .
          </p>
        ) : (
          <fieldset>
            <legend className="sr-only">Categories</legend>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {(categories.data?.data ?? []).map((cat) => {
                const checked = categoryIds.includes(cat.id);
                return (
                  <label
                    key={cat.id}
                    className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-md border px-3 py-2 transition-colors ${
                      checked
                        ? "border-primary bg-primary-soft"
                        : "border-line hover:border-line-strong"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleCategory(cat.id)}
                      className="size-5 shrink-0 accent-[var(--color-primary)]"
                    />
                    <span
                      aria-hidden="true"
                      className="size-3 shrink-0 rounded-full"
                      style={{ backgroundColor: cat.color_hex ?? "var(--color-line-strong)" }}
                    />
                    <span className="min-w-0 truncate text-sm font-medium">
                      {cat.name}
                      {!cat.is_active && (
                        <span className="ml-1 text-xs text-ink-faint">(inactive)</span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}
        {attempted && categoryIds.length === 0 && (
          <p className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-danger">
            <TriangleAlert className="size-4" aria-hidden="true" />
            Pick at least one category.
          </p>
        )}
      </SectionCard>

      {/* ===== Hashtags ===== */}
      <SectionCard
        id="hashtags"
        title="Hashtags"
        description="Comma or Enter creates a chip. Everything is normalised to lowercase."
      >
        <label htmlFor="cf-hashtags" className={LABEL}>
          Add hashtags
        </label>
        <input
          id="cf-hashtags"
          type="text"
          value={hashtagDraft}
          onChange={(e) => setHashtagDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              commitHashtags(hashtagDraft);
            } else if (e.key === "Backspace" && hashtagDraft === "" && hashtags.length > 0) {
              setHashtags((prev) => prev.slice(0, -1));
            }
          }}
          onBlur={() => commitHashtags(hashtagDraft)}
          placeholder="privacy, compliance"
          className={`${FIELD} mt-1.5`}
        />
        {hashtags.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2">
            {hashtags.map((tag) => (
              <li key={tag}>
                <span className="inline-flex items-center gap-1 rounded-md bg-primary-soft py-1 pl-2.5 pr-1 text-sm font-semibold text-primary-strong">
                  #{tag}
                  <button
                    type="button"
                    aria-label={`Remove hashtag ${tag}`}
                    onClick={() => setHashtags((prev) => prev.filter((t) => t !== tag))}
                    className="inline-flex size-6 items-center justify-center rounded-md hover:bg-surface"
                  >
                    <X className="size-3.5" aria-hidden="true" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {/* ===== Links ===== */}
      <SectionCard
        id="links"
        title="Links"
        description={`Up to ${MAX_LINKS} resources shown under the content.`}
      >
        <div className="flex flex-col gap-3">
          {links.map((row, i) => (
            <div key={row.key} className="flex flex-wrap items-end gap-2">
              <div className="min-w-45 flex-1">
                <label htmlFor={`link-label-${row.key}`} className={LABEL}>
                  Label {i + 1}
                </label>
                <input
                  id={`link-label-${row.key}`}
                  type="text"
                  value={row.label}
                  onChange={(e) =>
                    setLinks((prev) =>
                      prev.map((l) => (l.key === row.key ? { ...l, label: e.target.value } : l)),
                    )
                  }
                  className={`${FIELD} mt-1.5`}
                />
              </div>
              <div className="min-w-60 flex-2">
                <label htmlFor={`link-url-${row.key}`} className={LABEL}>
                  URL {i + 1}
                </label>
                <input
                  id={`link-url-${row.key}`}
                  type="url"
                  value={row.url}
                  onChange={(e) =>
                    setLinks((prev) =>
                      prev.map((l) => (l.key === row.key ? { ...l, url: e.target.value } : l)),
                    )
                  }
                  placeholder="https://"
                  className={`${FIELD} mt-1.5`}
                />
              </div>
              <button
                type="button"
                aria-label={`Remove link ${i + 1}`}
                onClick={() => setLinks((prev) => prev.filter((l) => l.key !== row.key))}
                disabled={links.length === 1}
                className={ICON_BTN}
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setLinks((prev) => [...prev, { key: nextRowKey(), label: "", url: "" }])}
          disabled={links.length >= MAX_LINKS}
          className={`${BTN_SECONDARY} mt-3`}
        >
          <Plus className="size-4" aria-hidden="true" />
          Add link
        </button>
        <p className="mt-2 text-xs text-ink-faint">
          {links.length}/{MAX_LINKS} rows used.
        </p>
      </SectionCard>

      {/* ===== Commercial disclosure ===== */}
      <SectionCard
        id="disclosure"
        title="Affiliate and sponsorship"
        description="Optional. Anything set here renders an automatic disclosure line to every learner - you cannot publish a paid placement without it."
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="cf-affiliate-tool" className={LABEL}>
              Affiliate tool
            </label>
            <input
              id="cf-affiliate-tool"
              type="text"
              value={affiliateTool}
              onChange={(e) => setAffiliateTool(e.target.value)}
              placeholder="Notion AI"
              className={`${FIELD} mt-1.5`}
            />
          </div>
          <div>
            <label htmlFor="cf-affiliate-url" className={LABEL}>
              Affiliate URL
            </label>
            <input
              id="cf-affiliate-url"
              type="url"
              value={affiliateUrl}
              onChange={(e) => setAffiliateUrl(e.target.value)}
              placeholder="https://"
              className={`${FIELD} mt-1.5`}
            />
          </div>
        </div>

        <label className="mt-5 flex min-h-12 w-fit cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={isSponsored}
            onChange={(e) => setIsSponsored(e.target.checked)}
            className="size-5 accent-[var(--color-primary)]"
          />
          <span className="font-semibold">This content is sponsored</span>
        </label>

        {isSponsored && (
          <div className="mt-3 max-w-sm">
            <label htmlFor="cf-sponsor" className={LABEL}>
              Sponsor name
            </label>
            <input
              id="cf-sponsor"
              type="text"
              value={sponsorName}
              onChange={(e) => setSponsorName(e.target.value)}
              className={`${FIELD} mt-1.5`}
            />
          </div>
        )}

        {disclosurePreview && (
          <div className="mt-5 rounded-md border border-streak/30 bg-streak-soft p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-streak">
              Disclosure preview - learners will see this
            </p>
            <p className="mt-2 text-sm leading-relaxed text-ink">{disclosurePreview}</p>
          </div>
        )}
      </SectionCard>

      {/* ===== Footer actions ===== */}
      <div className={`${CARD} p-5 sm:p-6`}>
        {showErrors && (
          <div role="alert" className="mb-4 rounded-md border border-danger/30 bg-danger-soft p-4">
            <p className="flex items-center gap-2 font-semibold text-danger">
              <TriangleAlert className="size-5" aria-hidden="true" />
              Fix before saving
            </p>
            <ul className="mt-2 list-disc pl-5 text-sm text-ink">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        )}

        {saveError && <ErrorBox message={saveError} className="mb-4" />}

        <p className="mb-4 flex items-start gap-2 text-xs leading-relaxed text-ink-faint">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          Everything is created as a draft. Nothing is visible to learners until you publish it,
          and publishing needs at least one episode with captions.
        </p>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void createDraft()}
            disabled={saving}
            className={BTN_PRIMARY}
          >
            {saving ? "Creating..." : "Create draft and add episodes"}
          </button>
          <Link href="/admin/content" className={BTN_SECONDARY}>
            Cancel
          </Link>
        </div>
      </div>
    </div>
  );
}
