"use client";

import Link from "next/link";

/**
 * Cal.com booking embed for the 1:1 training page. Reads
 * NEXT_PUBLIC_CALCOM_HANDLE, which is inlined at build time for client
 * components. When unset, the booking iframe is hidden in favour of an
 * enquiry fallback rather than shipping a broken embed.
 */
export function BookingEmbed() {
  const handle = process.env.NEXT_PUBLIC_CALCOM_HANDLE;

  if (!handle) {
    return (
      <div className="rounded-card border border-line bg-surface p-6 text-center">
        <p className="text-ink-muted">Booking opens soon.</p>
        <Link
          href="/enquiry?service=training"
          className="mt-4 inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-6 font-semibold text-on-primary transition-colors hover:bg-primary-strong"
        >
          Enquire about training
        </Link>
      </div>
    );
  }

  return (
    <iframe
      src={`https://cal.com/${handle}`}
      title="Book a session"
      className="h-[640px] w-full rounded-card border border-line"
      loading="lazy"
    />
  );
}
