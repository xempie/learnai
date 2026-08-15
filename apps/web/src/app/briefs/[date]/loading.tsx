import {
  NewsCardSkeleton,
  TechniqueCardSkeleton,
  VideoCardSkeleton,
} from "@/components/daily-brief/skeletons";

export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="mb-6 h-4 w-32 animate-pulse rounded-control bg-line" />
      <div className="mb-8 space-y-3">
        <div className="h-4 w-40 animate-pulse rounded-control bg-line" />
        <div className="h-8 w-full animate-pulse rounded-control bg-line" />
      </div>
      <div className="space-y-6">
        <NewsCardSkeleton />
        <TechniqueCardSkeleton />
        <VideoCardSkeleton />
      </div>
    </div>
  );
}
