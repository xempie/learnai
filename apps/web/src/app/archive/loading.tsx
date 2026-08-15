function Bone({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-control bg-line ${className ?? ""}`} />;
}

export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="mb-6 space-y-2">
        <Bone className="h-8 w-32" />
        <Bone className="h-4 w-64" />
      </div>
      <div className="mb-6 flex gap-2">
        {Array.from({ length: 5 }).map((_, index) => (
          <Bone key={index} className="h-8 w-20 rounded-full" />
        ))}
      </div>
      <Bone className="mb-2 h-4 w-28" />
      <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="space-y-2 px-4 py-3.5">
            <Bone className="h-3 w-24" />
            <Bone className="h-5 w-3/4" />
          </div>
        ))}
      </div>
    </div>
  );
}
