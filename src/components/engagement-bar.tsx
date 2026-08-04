"use client";

import { useState } from "react";
import { Bookmark, Heart, Share2 } from "lucide-react";
import { formatCount } from "@/components/content-card";
import { ApiClientError, api } from "@/lib/api-client";

interface LikeResponse {
  liked: boolean;
  like_count: number;
}

interface BookmarkResponse {
  bookmarked: boolean;
  bookmark_count: number;
}

export interface EngagementBarProps {
  topicId: string;
  liked: boolean;
  likeCount: number;
  bookmarked: boolean;
  bookmarkCount: number;
}

function failureMessage(err: unknown): string {
  if (err instanceof ApiClientError) return err.message;
  return "That did not save. Try again.";
}

/**
 * Optimistic engagement controls: the button flips on click, the server's
 * authoritative counts overwrite it on success, and the previous state is
 * restored on failure.
 */
export function EngagementBar({
  topicId,
  liked: initialLiked,
  likeCount: initialLikeCount,
  bookmarked: initialBookmarked,
  bookmarkCount: initialBookmarkCount,
}: EngagementBarProps) {
  const [liked, setLiked] = useState(initialLiked);
  const [likeCount, setLikeCount] = useState(initialLikeCount);
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [bookmarkCount, setBookmarkCount] = useState(initialBookmarkCount);
  const [shareMessage, setShareMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [busy, setBusy] = useState<"like" | "bookmark" | null>(null);

  async function toggleLike() {
    if (busy) return;
    const prevLiked = liked;
    const prevCount = likeCount;

    setBusy("like");
    setErrorMessage("");
    setLiked(!prevLiked);
    setLikeCount(prevCount + (prevLiked ? -1 : 1));

    try {
      const res = await api.post<LikeResponse>(`/topics/${topicId}/like`);
      setLiked(res.liked);
      setLikeCount(res.like_count);
    } catch (err) {
      setLiked(prevLiked);
      setLikeCount(prevCount);
      setErrorMessage(failureMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function toggleBookmark() {
    if (busy) return;
    const prevBookmarked = bookmarked;
    const prevCount = bookmarkCount;

    setBusy("bookmark");
    setErrorMessage("");
    setBookmarked(!prevBookmarked);
    setBookmarkCount(prevCount + (prevBookmarked ? -1 : 1));

    try {
      const res = await api.post<BookmarkResponse>(`/topics/${topicId}/bookmark`);
      setBookmarked(res.bookmarked);
      setBookmarkCount(res.bookmark_count);
    } catch (err) {
      setBookmarked(prevBookmarked);
      setBookmarkCount(prevCount);
      setErrorMessage(failureMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function share() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setShareMessage("Link copied");
    } catch {
      setShareMessage("Copy the address bar to share this");
    }
    setTimeout(() => setShareMessage(""), 2500);
  }

  const buttonBase =
    "inline-flex min-h-11 items-center gap-2 rounded-md border border-line px-4 text-sm font-semibold transition-colors hover:border-primary hover:text-primary-strong";

  return (
    <section
      aria-label="Engagement"
      className="rounded-card border border-line bg-surface p-4 shadow-xs"
    >
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void toggleLike()}
          aria-pressed={liked}
          aria-label={liked ? "Unlike this" : "Like this"}
          className={`${buttonBase} ${liked ? "border-danger text-danger" : "text-ink-muted"}`}
        >
          <Heart
            className="size-5"
            aria-hidden="true"
            fill={liked ? "currentColor" : "none"}
          />
          <span className="hidden sm:inline">{liked ? "Liked" : "Like"}</span>
          <span className="tabular-nums">{formatCount(likeCount)}</span>
        </button>

        <button
          type="button"
          onClick={() => void toggleBookmark()}
          aria-pressed={bookmarked}
          aria-label={bookmarked ? "Remove from saved" : "Save for later"}
          className={`${buttonBase} ${
            bookmarked ? "border-primary text-primary-strong" : "text-ink-muted"
          }`}
        >
          <Bookmark
            className="size-5"
            aria-hidden="true"
            fill={bookmarked ? "currentColor" : "none"}
          />
          <span className="hidden sm:inline">{bookmarked ? "Saved" : "Save"}</span>
          <span className="tabular-nums">{formatCount(bookmarkCount)}</span>
        </button>

        <button
          type="button"
          onClick={() => void share()}
          aria-label="Copy a link to this page"
          className={`${buttonBase} text-ink-muted`}
        >
          <Share2 className="size-5" aria-hidden="true" />
          <span className="hidden sm:inline">Share</span>
        </button>
      </div>

      <p
        role="status"
        aria-live="polite"
        className={`mt-2 text-sm font-semibold text-success ${shareMessage ? "" : "sr-only"}`}
      >
        {shareMessage}
      </p>

      <p
        role="status"
        aria-live="polite"
        className={`mt-2 text-sm font-semibold text-danger ${errorMessage ? "" : "sr-only"}`}
      >
        {errorMessage}
      </p>
    </section>
  );
}
