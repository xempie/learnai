import Link from "next/link";
import { Check } from "lucide-react";

/** Content contract for a single service's detail page. */
export interface ServiceSpec {
  eyebrow: string;
  title: string;
  subtitle: string;
  price: string; // e.g. "$12–25k per engagement"
  audience: string;
  outcome: string; // the defined outcome — required by the action plan
  format: string[]; // bullet list
  enquiryService: string; // service_interest value for the CTA link
}

/**
 * Body content for a service detail page: fact band (price / audience /
 * outcome), "how it runs" bullets, and the CTA into the enquiry form. The
 * hero (eyebrow/title/subtitle) and surrounding chrome come from
 * `ServiceShell` — this component only renders what goes inside it.
 */
export function ServiceDetail({ spec }: { spec: ServiceSpec }) {
  return (
    <div className="flex flex-col gap-8">
      <dl className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-card border border-line bg-surface p-6">
          <dt className="text-sm font-medium tracking-[0.08em] text-ink-faint uppercase">
            Price
          </dt>
          <dd className="mt-2 font-display text-xl font-semibold">{spec.price}</dd>
        </div>
        <div className="rounded-card border border-line bg-surface p-6">
          <dt className="text-sm font-medium tracking-[0.08em] text-ink-faint uppercase">
            Audience
          </dt>
          <dd className="mt-2 font-display text-xl font-semibold">{spec.audience}</dd>
        </div>
        <div className="rounded-card border border-line bg-surface p-6">
          <dt className="text-sm font-medium tracking-[0.08em] text-ink-faint uppercase">
            Outcome
          </dt>
          <dd className="mt-2 text-ink-muted">{spec.outcome}</dd>
        </div>
      </dl>

      <div>
        <h2 className="text-xl font-semibold">How it runs</h2>
        <ul className="mt-4 flex flex-col gap-3">
          {spec.format.map((item) => (
            <li key={item} className="flex items-start gap-3 text-ink-muted">
              <Check className="mt-1 size-4 shrink-0 text-primary-strong" aria-hidden="true" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>

      <Link
        href={`/enquiry?service=${spec.enquiryService}`}
        className="inline-flex min-h-12 w-fit items-center justify-center rounded-md bg-primary px-7 font-semibold text-on-primary transition-colors hover:bg-primary-strong"
      >
        Start the conversation
      </Link>
    </div>
  );
}
