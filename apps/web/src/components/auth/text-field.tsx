import type { ReactNode } from "react";
import { TriangleAlertIcon } from "@/components/icons";

export function TextField({
  id,
  label,
  type = "text",
  value,
  onChange,
  onBlur,
  error,
  autoComplete,
  required,
  rightSlot,
}: {
  id: string;
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: string;
  autoComplete?: string;
  required?: boolean;
  rightSlot?: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-foreground">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          autoComplete={autoComplete}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={`w-full rounded-control border bg-surface px-3 py-2.5 text-[15px] text-foreground focus:outline-none ${
            error ? "border-danger" : "border-line focus:border-primary"
          } ${rightSlot ? "pr-10" : ""}`}
        />
        {rightSlot && <div className="absolute top-1/2 right-2 -translate-y-1/2">{rightSlot}</div>}
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1.5 flex items-center gap-1 text-xs font-medium text-danger">
          <TriangleAlertIcon size={13} />
          {error}
        </p>
      )}
    </div>
  );
}
