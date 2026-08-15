/**
 * Data-source layer — UI Phase 1's single point of contact for page/
 * component data. Every page in this build gets data ONLY through this
 * module, never by importing `lib/sample-data.ts` directly.
 *
 * SWAP POINT: today every function below reads from the in-memory sample
 * fixtures. Once the backend is live, these signatures stay the same and
 * their bodies switch to `apiFetch<T>(...)` calls against `/api/v1/*`
 * (see `lib/api-client.ts`, the pattern the T03/T06 pages already use) —
 * no page component should need to change when that happens.
 */
import {
  adminMetrics,
  colleagues,
  contentSources,
  currentReviewer,
  currentUser,
  editions,
  organisation,
  pendingOrganisations,
  prompts,
  reviewQueue,
  todayEdition,
  type AdminMetrics,
  type AdminReviewer,
  type Colleague,
  type ContentItem,
  type ContentSource,
  type CurrentUser,
  type Edition,
  type Organisation,
  type Prompt,
  type ReviewQueueItem,
} from "@/lib/sample-data";

export async function getTodayEdition(): Promise<Edition> {
  return todayEdition;
}

export async function getEditions(): Promise<Edition[]> {
  // Most recent first, matching how an archive list reads.
  return [...editions].reverse();
}

export async function getEditionByDate(editionDate: string): Promise<Edition | null> {
  return editions.find((edition) => edition.editionDate === editionDate) ?? null;
}

export async function getPrompts(): Promise<Prompt[]> {
  return prompts;
}

/** Every published content item (news + technique + video) across every edition, most recent edition first. */
export async function getAllContentItems(): Promise<ContentItem[]> {
  return [...editions].reverse().flatMap((edition) => edition.items);
}

/** Single content item by slug, for `/content/[slug]` and search result links. */
export async function getContentItemBySlug(slug: string): Promise<ContentItem | null> {
  for (const edition of editions) {
    const item = edition.items.find((candidate) => candidate.slug === slug);
    if (item) return item;
  }
  return null;
}

/** The edition a content item belongs to — used to render its publish date. */
export async function getEditionForContentItem(item: ContentItem): Promise<Edition | null> {
  return editions.find((edition) => edition.id === item.editionId) ?? null;
}

export async function getContentSources(): Promise<ContentSource[]> {
  return contentSources;
}

export async function getContentSource(sourceId: string): Promise<ContentSource | null> {
  return contentSources.find((source) => source.id === sourceId) ?? null;
}

export async function getOrganisation(): Promise<Organisation> {
  return organisation;
}

export async function getColleagues(): Promise<Colleague[]> {
  return colleagues.filter((colleague) => colleague.showInCohort);
}

export async function getCurrentUser(): Promise<CurrentUser> {
  return currentUser;
}

export async function getReviewQueue(): Promise<ReviewQueueItem[]> {
  return reviewQueue;
}

export async function getAdminMetrics(): Promise<AdminMetrics> {
  return adminMetrics;
}

export async function getCurrentReviewer(): Promise<AdminReviewer> {
  return currentReviewer;
}

export async function getPendingOrganisations(): Promise<Organisation[]> {
  return pendingOrganisations;
}
