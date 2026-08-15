import {
  NewsCardSkeleton,
  TechniqueCardSkeleton,
  VideoCardSkeleton,
} from "@/components/daily-brief/skeletons";

/**
 * Next's App Router route-level loading state for `/`. `data-source.ts`
 * resolves instantly today (in-memory sample data), so this won't often
 * be visible yet — it's the seam a real network-backed `getTodayEdition`
 * will render into once the backend is live.
 */
export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="mb-8 space-y-3">
        <div className="h-4 w-40 animate-pulse rounded-control bg-line" />
        <div className="h-10 w-full animate-pulse rounded-control bg-line" />
      </div>
      <div className="space-y-6">
        <NewsCardSkeleton />
        <TechniqueCardSkeleton />
        <VideoCardSkeleton />
      </div>
    </div>
  );
}
