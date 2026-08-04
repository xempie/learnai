"use client";

import { useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { ApiClientError, api } from "@/lib/api-client";
import type { ServiceInterest } from "@/lib/leads";
import { SERVICE_INTERESTS } from "@/lib/leads";

const SERVICE_LABELS: Record<ServiceInterest, string> = {
  workshop: "Corporate workshop",
  advisory: "AI advisory",
  pilot_sprint: "AI Pilot Sprint",
  training: "1:1 training",
  team_platform: "Team platform access",
  other: "Something else",
};

interface EnquiryResponse {
  id: string;
  is_team: boolean;
}

/** Field-level message under an input, wired to the input via aria-describedby. */
function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1.5 flex items-start gap-1.5 text-sm text-danger">
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      {message}
    </p>
  );
}

/**
 * Public enquiry form — POST /api/v1/enquiries. No auth required; a buyer
 * must never need an account to start a sales conversation.
 */
export function EnquiryForm({ defaultService }: { defaultService?: ServiceInterest }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [orgName, setOrgName] = useState("");
  const [service, setService] = useState<ServiceInterest>(defaultService ?? SERVICE_INTERESTS[0]);
  const [teamSize, setTeamSize] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<EnquiryResponse | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;

    setBusy(true);
    setError(null);
    setFieldErrors({});

    try {
      const res = await api.post<EnquiryResponse>("/enquiries", {
        name,
        email,
        org_name: orgName.trim() === "" ? undefined : orgName.trim(),
        service_interest: service,
        team_size: teamSize.trim() === "" ? undefined : Number(teamSize),
        message: message.trim() === "" ? undefined : message.trim(),
      });
      setResult(res);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
        setFieldErrors(err.fieldErrors ?? {});
      } else {
        setError("We could not send that. Check your connection and try again.");
      }
      setBusy(false);
    }
  }

  if (result) {
    return (
      <div className="rounded-card border border-line bg-surface p-6 shadow-xs">
        <h2 className="text-xl font-semibold">
          Thanks &mdash; we&rsquo;ll reply within one business day.
        </h2>
        {result.is_team && (
          <p className="mt-2 text-ink-muted">
            We&rsquo;ll come prepared to talk about your whole team, not just one seat.
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      {error && (
        <p
          role="alert"
          className="mb-5 flex items-start gap-2 rounded-md bg-danger-soft px-3 py-2.5 text-sm font-medium text-ink"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
          {error}
        </p>
      )}

      <form onSubmit={submit} className="flex flex-col gap-4">
        <div>
          <label htmlFor="name" className="block font-semibold">
            Name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={fieldErrors.name ? true : undefined}
            aria-describedby={fieldErrors.name ? "name-error" : undefined}
            className="mt-2 h-12 w-full rounded-field border border-line bg-surface px-4 font-medium focus:border-primary"
          />
          <FieldError id="name-error" message={fieldErrors.name} />
        </div>

        <div>
          <label htmlFor="email" className="block font-semibold">
            Work email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            placeholder="you@yourorg.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={fieldErrors.email ? true : undefined}
            aria-describedby={fieldErrors.email ? "email-error" : undefined}
            className="mt-2 h-12 w-full rounded-field border border-line bg-surface px-4 font-medium placeholder:text-ink-faint focus:border-primary"
          />
          <FieldError id="email-error" message={fieldErrors.email} />
        </div>

        <div>
          <label htmlFor="org-name" className="block font-semibold">
            Organisation <span className="font-normal text-ink-faint">(optional)</span>
          </label>
          <input
            id="org-name"
            name="org_name"
            type="text"
            autoComplete="organization"
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            aria-invalid={fieldErrors.org_name ? true : undefined}
            aria-describedby={fieldErrors.org_name ? "org-name-error" : undefined}
            className="mt-2 h-12 w-full rounded-field border border-line bg-surface px-4 font-medium focus:border-primary"
          />
          <FieldError id="org-name-error" message={fieldErrors.org_name} />
        </div>

        <div>
          <label htmlFor="service" className="block font-semibold">
            What do you need?
          </label>
          <select
            id="service"
            name="service_interest"
            required
            value={service}
            onChange={(e) => setService(e.target.value as ServiceInterest)}
            aria-invalid={fieldErrors.service_interest ? true : undefined}
            aria-describedby={fieldErrors.service_interest ? "service-error" : undefined}
            className="mt-2 h-12 w-full rounded-field border border-line bg-surface px-3 font-medium focus:border-primary"
          >
            {SERVICE_INTERESTS.map((value) => (
              <option key={value} value={value}>
                {SERVICE_LABELS[value]}
              </option>
            ))}
          </select>
          <FieldError id="service-error" message={fieldErrors.service_interest} />
        </div>

        <div>
          <label htmlFor="team-size" className="block font-semibold">
            Team size <span className="font-normal text-ink-faint">(optional)</span>
          </label>
          <input
            id="team-size"
            name="team_size"
            type="number"
            min={1}
            max={100_000}
            inputMode="numeric"
            value={teamSize}
            onChange={(e) => setTeamSize(e.target.value)}
            aria-invalid={fieldErrors.team_size ? true : undefined}
            aria-describedby={fieldErrors.team_size ? "team-size-error" : undefined}
            className="mt-2 h-12 w-full rounded-field border border-line bg-surface px-4 font-medium focus:border-primary"
          />
          <FieldError id="team-size-error" message={fieldErrors.team_size} />
        </div>

        <div>
          <label htmlFor="message" className="block font-semibold">
            Message <span className="font-normal text-ink-faint">(optional)</span>
          </label>
          <textarea
            id="message"
            name="message"
            rows={4}
            maxLength={4000}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            aria-invalid={fieldErrors.message ? true : undefined}
            aria-describedby={fieldErrors.message ? "message-error" : undefined}
            className="mt-2 w-full rounded-field border border-line bg-surface px-4 py-3 font-medium focus:border-primary"
          />
          <FieldError id="message-error" message={fieldErrors.message} />
        </div>

        <button
          type="submit"
          disabled={busy}
          className="mt-2 inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-primary font-semibold text-on-primary transition-colors hover:bg-primary-strong disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          {busy ? "Sending…" : "Send enquiry"}
        </button>
      </form>
    </div>
  );
}
