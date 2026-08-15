function Bone({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-control bg-line ${className ?? ""}`} />;
}

export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="mb-6 space-y-2">
        <Bone className="h-8 w-48" />
        <Bone className="h-4 w-72" />
      </div>
      <div className="mb-6 flex gap-2">
        {Array.from({ length: 5 }).map((_, index) => (
          <Bone key={index} className="h-8 w-20 rounded-full" />
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="space-y-3 rounded-card border border-line bg-surface p-5">
            <Bone className="h-4 w-24" />
            <Bone className="h-5 w-3/4" />
            <Bone className="h-4 w-full" />
            <Bone className="h-8 w-28 rounded-control" />
          </div>
        ))}
      </div>
    </div>
  );
}
