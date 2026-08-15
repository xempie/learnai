function Bone({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-control bg-line ${className ?? ""}`} />;
}

export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-8 sm:px-6 sm:py-12">
      <div className="space-y-2">
        <Bone className="h-4 w-16" />
        <Bone className="h-8 w-56" />
        <Bone className="h-4 w-40" />
      </div>
      <div className="space-y-2">
        <Bone className="h-6 w-40" />
        <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="flex items-center justify-between px-4 py-3">
              <Bone className="h-4 w-28" />
              <Bone className="h-4 w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
