"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

export function PasswordInput({
  id,
  autoComplete = "current-password",
  helper,
}: {
  id: string;
  autoComplete?: string;
  helper?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <div className="relative">
        <input
          id={id}
          name={id}
          type={show ? "text" : "password"}
          required
          minLength={10}
          autoComplete={autoComplete}
          className="h-12 w-full rounded-field border border-line bg-surface px-4 pr-14 font-medium focus:border-primary"
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          aria-label={show ? "Hide password" : "Show password"}
          aria-pressed={show}
          className="absolute right-1 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-lg text-ink-faint hover:bg-band hover:text-ink"
        >
          {show ? (
            <EyeOff className="size-5" aria-hidden="true" />
          ) : (
            <Eye className="size-5" aria-hidden="true" />
          )}
        </button>
      </div>
      {helper && <p className="mt-1.5 text-sm text-ink-faint">{helper}</p>}
    </div>
  );
}
