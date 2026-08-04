import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal-page";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Terms of service",
  description:
    "The rules for using the service: who may sign up, what you may do with the episodes, how comments are moderated, and how trials and cancellation work.",
};

const H2 = "mt-8 text-xl font-semibold";
const P = "mt-4 text-ink-muted leading-relaxed";
const UL = "mt-4 list-disc space-y-2 pl-5 text-ink-muted";

export default function TermsPage() {
  return (
    <LegalPage title="Terms of service" updated="2 August 2026">
      <p className={P}>
        These terms are the agreement between you and {BRAND.name}. Creating an account means you
        accept them. They are written plainly on purpose - if a clause needs a lawyer to decode, it
        does not belong in a consumer product.
      </p>

      <h2 className={H2}>Who can use the service</h2>
      <p className={P}>
        You must be at least 16 years old to create an account. If you are using {BRAND.name} on
        behalf of an organisation, you confirm you are permitted to accept these terms for it. We
        may close an account we reasonably believe belongs to someone under 16.
      </p>

      <h2 className={H2}>Your account and nickname</h2>
      <p className={P}>
        You are responsible for keeping your sign-in details to yourself. Accounts are personal -
        do not share one with a colleague or a class. Nicknames are public and must not:
      </p>
      <ul className={UL}>
        <li>Impersonate another person, organisation or member of our staff.</li>
        <li>Contain slurs, harassment, or sexually explicit language.</li>
        <li>Advertise a product, service or link.</li>
      </ul>
      <p className={P}>
        We may reclaim a nickname that breaks these rules, and will tell you when we do so you can
        pick another.
      </p>

      <h2 className={H2}>The episodes, and what you may do with them</h2>
      <p className={P}>
        Videos, articles, quizzes, downloads and everything else we publish remain our property or
        our licensors’. Your subscription is a personal, non-transferable licence to view that
        material for your own learning.
      </p>
      <p className={P}>You may:</p>
      <ul className={UL}>
        <li>Watch and read anything in your plan, as often as you like, on your own devices.</li>
        <li>Use the downloadable templates and checklists in your own work.</li>
        <li>Quote a short passage with attribution, as you would any other published source.</li>
      </ul>
      <p className={P}>You may not:</p>
      <ul className={UL}>
        <li>Re-upload, re-host, screen-record or redistribute the episodes.</li>
        <li>Run group screenings or internal training sessions from a single account.</li>
        <li>Scrape the content, or use it to train a machine-learning model.</li>
      </ul>
      <p className={P}>
        If you want to use the material across a team, an organisation plan exists for exactly that
        and costs less than the risk of not asking.
      </p>

      <h2 className={H2}>Comments and conduct</h2>
      <p className={P}>
        Comments are for questions, corrections and useful experience. Keep them civil. The
        following will be removed:
      </p>
      <ul className={UL}>
        <li>Harassment, abuse, or attacks on a person rather than an argument.</li>
        <li>Spam, referral links and self-promotion.</li>
        <li>Confidential or personal information about anyone, including yourself.</li>
        <li>Deliberate misinformation about the subject matter.</li>
      </ul>
      <p className={P}>
        You keep ownership of what you post, and you grant us a licence to display it on the
        platform. Anyone can report a comment. Reports are reviewed by a human, not an automated
        filter acting alone. Repeated breaches lead to a suspension; serious ones lead to immediate
        removal. You can delete your own comments at any time.
      </p>

      <h2 className={H2}>Affiliate links and sponsorship</h2>
      <p className={P}>
        We sometimes earn a commission when you sign up to a tool we recommend, and we occasionally
        publish sponsored content. Whenever either applies, it is labelled on the item itself -
        before you watch or read it, not in a footnote.
      </p>
      <p className={P}>
        A commercial relationship never buys a positive review. If a tool we earn from is not worth
        paying for, we say so, and we will drop the relationship rather than soften the assessment.
      </p>

      <h2 className={H2}>Trials, payment and cancellation</h2>
      <p className={P}>
        New accounts get a 7-day free trial with full access. No card is required to start it, and
        nothing charges automatically when it ends - the trial simply stops and you decide whether
        to subscribe.
      </p>
      <p className={P}>
        Paid subscriptions renew monthly until you cancel. You can cancel at any time from Settings
        and keep access until the end of the period you have paid for. We do not use retention
        traps: cancelling takes the same number of clicks as subscribing.
      </p>

      <h2 className={H2}>Availability and changes</h2>
      <p className={P}>
        We aim to keep the service running continuously but do not guarantee it. Episodes are added,
        updated and occasionally withdrawn when they become out of date - an unpublished item may
        disappear from your bookmarks, and we would rather remove stale advice than leave it up.
      </p>

      <h2 className={H2}>Suspension and termination</h2>
      <p className={P}>
        You may close your account whenever you like from Settings. We may suspend or close an
        account that breaches these terms, abuses the platform, or is used to redistribute the
        content. Where the breach is not serious we will warn you first and give you a chance to
        fix it. If we close a paid account for reasons that are not your fault, we refund the
        unused portion.
      </p>

      <h2 className={H2}>Disclaimers</h2>
      <p className={P}>
        {BRAND.name} teaches general AI literacy. It is not legal, financial, medical or compliance
        advice, and it does not replace your organisation’s own policies. Verify anything you intend
        to act on - which is, in fairness, one of the first things we teach.
      </p>

      <h2 className={H2}>Governing law and contact</h2>
      <p className={P}>
        These terms are governed by the laws of South Australia, Australia. For questions about
        them, please use the enquiry form at{" "}
        <Link href="/enquiry">acadu.ai/enquiry</Link>.
      </p>
    </LegalPage>
  );
}
