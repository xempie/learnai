function Bone({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-control bg-line ${className ?? ""}`} />;
}

function CardSkeleton({ mediaClassName }: { mediaClassName?: string }) {
  return (
    <div className="rounded-card border border-line bg-surface p-6">
      <Bone className="mb-3 h-5 w-20" />
      <Bone className="mb-4 h-7 w-3/4" />
      {mediaClassName && <Bone className={mediaClassName} />}
      <div className="mt-4 space-y-2">
        <Bone className="h-4 w-full" />
        <Bone className="h-4 w-full" />
        <Bone className="h-4 w-2/3" />
      </div>
    </div>
  );
}

export function NewsCardSkeleton() {
  return <CardSkeleton />;
}

export function TechniqueCardSkeleton() {
  return <CardSkeleton mediaClassName="h-24 w-full" />;
}

export function VideoCardSkeleton() {
  return <CardSkeleton mediaClassName="aspect-[9/16] w-full max-w-[220px]" />;
}

/** Empty state: no edition available for the requested date. */
export function DailyBriefEmptyState() {
  return (
    <div className="rounded-card border border-dashed border-line bg-surface p-8 text-center">
      <p className="font-heading text-lg font-medium text-foreground">No brief for today yet</p>
      <p className="mt-1 text-sm text-muted">
        Today&apos;s edition hasn&apos;t published. Check back shortly, or read a past edition from the archive.
      </p>
    </div>
  );
}
