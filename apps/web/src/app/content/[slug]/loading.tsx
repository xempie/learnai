function Bone({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-control bg-line ${className ?? ""}`} />;
}

export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <Bone className="mb-6 h-4 w-28" />
      <div className="mx-auto max-w-[70ch] space-y-4">
        <Bone className="h-5 w-32" />
        <Bone className="h-9 w-full" />
        <Bone className="h-4 w-full" />
        <Bone className="h-4 w-full" />
        <Bone className="h-4 w-2/3" />
      </div>
    </div>
  );
}
