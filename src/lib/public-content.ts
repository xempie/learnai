import "server-only";

import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { categories, topicCategories, topics, users } from "@/db/schema";

/**
 * Read-only queries for the public marketing pages. These run in server
 * components rather than going out over HTTP to our own API - one less network
 * hop, and the landing page is the first thing a visitor waits on.
 *
 * Everything here is published, non-deleted content only. No viewer state, no
 * personalisation, nothing that depends on a session.
 */

export interface PublicTopicCard {
  id: string;
  type: string;
  slug: string;
  title: string;
  excerpt: string | null;
  thumbnail_url: string | null;
  skill_level: string;
  episode_count: number;
  total_duration_sec: number;
  view_count: number;
  is_free: boolean;
  author_name: string | null;
  published_at: string | null;
  categories: { id: string; slug: string; name: string; color_hex: string }[];
}

export interface PublicCategory {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  color_hex: string | null;
  topic_count: number;
}

const publishedTopic = and(
  eq(topics.status, "published"),
  eq(topics.type, "topic"),
  isNull(topics.deletedAt),
);

async function withCategories(rows: {
  id: string;
  type: string;
  slug: string;
  title: string;
  excerpt: string | null;
  thumbnailKey: string | null;
  skillLevel: string;
  episodeCount: number;
  totalDurationSec: number;
  viewCount: number;
  isFree: boolean;
  authorName: string | null;
  publishedAt: Date | null;
}[]): Promise<PublicTopicCard[]> {
  if (rows.length === 0) return [];

  const links = await db
    .select({
      topicId: topicCategories.topicId,
      id: categories.id,
      slug: categories.slug,
      name: categories.name,
      colorHex: categories.colorHex,
    })
    .from(topicCategories)
    .innerJoin(categories, eq(categories.id, topicCategories.categoryId))
    .where(
      inArray(
        topicCategories.topicId,
        rows.map((r) => r.id),
      ),
    );

  const byTopic = new Map<string, PublicTopicCard["categories"]>();
  for (const l of links) {
    const list = byTopic.get(l.topicId) ?? [];
    list.push({ id: l.id, slug: l.slug, name: l.name, color_hex: l.colorHex ?? "#202020" });
    byTopic.set(l.topicId, list);
  }

  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    slug: r.slug,
    title: r.title,
    excerpt: r.excerpt,
    // Thumbnails are public assets; nothing here needs a signed URL.
    thumbnail_url: r.thumbnailKey ? `/uploads/${r.thumbnailKey}` : null,
    skill_level: r.skillLevel,
    episode_count: r.episodeCount,
    total_duration_sec: r.totalDurationSec,
    view_count: r.viewCount,
    is_free: r.isFree,
    author_name: r.authorName,
    published_at: r.publishedAt?.toISOString() ?? null,
    categories: byTopic.get(r.id) ?? [],
  }));
}

const cardColumns = {
  id: topics.id,
  type: topics.type,
  slug: topics.slug,
  title: topics.title,
  excerpt: topics.excerpt,
  thumbnailKey: topics.thumbnailKey,
  skillLevel: topics.skillLevel,
  episodeCount: topics.episodeCount,
  totalDurationSec: topics.totalDurationSec,
  viewCount: topics.viewCount,
  isFree: topics.isFree,
  authorName: users.nickname,
  publishedAt: topics.publishedAt,
};

/** Most-viewed published topics. */
export async function trendingTopics(limit = 4): Promise<PublicTopicCard[]> {
  const rows = await db
    .select(cardColumns)
    .from(topics)
    .leftJoin(users, eq(users.id, topics.authorId))
    .where(publishedTopic)
    .orderBy(desc(topics.viewCount))
    .limit(limit);
  return withCategories(rows);
}

/** Most recently published topics. */
export async function newestTopics(limit = 4): Promise<PublicTopicCard[]> {
  const rows = await db
    .select(cardColumns)
    .from(topics)
    .leftJoin(users, eq(users.id, topics.authorId))
    .where(publishedTopic)
    .orderBy(desc(topics.publishedAt))
    .limit(limit);
  return withCategories(rows);
}

/** The permanently-free starter set, in their intended order. */
export async function freeStarterTopics(limit = 3): Promise<PublicTopicCard[]> {
  const rows = await db
    .select(cardColumns)
    .from(topics)
    .leftJoin(users, eq(users.id, topics.authorId))
    .where(and(publishedTopic, eq(topics.isFree, true)))
    .orderBy(topics.freeOrder)
    .limit(limit);
  return withCategories(rows);
}

/** Active categories with a live published-topic count. */
export async function publicCategories(): Promise<PublicCategory[]> {
  const rows = await db
    .select({
      id: categories.id,
      slug: categories.slug,
      name: categories.name,
      description: categories.description,
      colorHex: categories.colorHex,
      topicCount: sql<number>`(
        select count(*)::int
        from ${topicCategories}
        join ${topics} on ${topics.id} = ${topicCategories.topicId}
        where ${topicCategories.categoryId} = ${categories.id}
          and ${topics.status} = 'published'
          and ${topics.type} = 'topic'
          and ${topics.deletedAt} is null
      )`,
    })
    .from(categories)
    .where(eq(categories.isActive, true))
    .orderBy(categories.sortOrder);

  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    description: r.description,
    color_hex: r.colorHex,
    topic_count: Number(r.topicCount),
  }));
}

/** How many distinct organisations have at least one learner. */
export async function organisationCount(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(distinct ${users.orgId})::int` })
    .from(users)
    .where(isNull(users.deletedAt));
  return row?.count ?? 0;
}
