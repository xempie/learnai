interface AvatarProps {
  name: string;
  hue: number;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const SIZES = {
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-12 text-base",
  xl: "size-20 text-2xl",
};

/** Preset avatar: coloured disc + initials. No photo uploads in MVP. */
export function Avatar({ name, hue, size = "md", className = "" }: AvatarProps) {
  const initials = name
    .split(/[\s_.-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");

  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold ${SIZES[size]} ${className}`}
      style={{
        background: `linear-gradient(135deg, hsl(${hue} 70% 88%), hsl(${hue} 65% 78%))`,
        color: `hsl(${hue} 65% 24%)`,
      }}
    >
      {initials}
    </span>
  );
}
