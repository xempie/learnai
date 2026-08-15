function Bone({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-control bg-line ${className ?? ""}`} />;
}

export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="mb-6 flex items-center gap-4 rounded-card border border-line bg-surface p-5">
        <Bone className="h-14 w-14 rounded-full" />
        <div className="flex-1 space-y-2">
          <Bone className="h-5 w-40" />
          <Bone className="h-4 w-56" />
        </div>
      </div>
      <Bone className="mb-4 h-6 w-32" />
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Bone key={index} className="h-12 w-full" />
        ))}
      </div>
    </div>
  );
}
