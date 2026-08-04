import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Privacy policy",
  description:
    "What we collect, what your organisation can and cannot see, how long we keep it, and how to get it back or have it deleted.",
};

const H2 = "mt-8 text-xl font-semibold";
const P = "mt-4 text-ink-muted leading-relaxed";
const UL = "mt-4 list-disc space-y-2 pl-5 text-ink-muted";

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy" updated="2 August 2026">
      <p className={P}>
        This policy explains what {BRAND.name} collects, why, and what we will never do with it. It
        is written to be read rather than skimmed past. If anything here is unclear, ask us before
        you sign up - the answer will not be different once you have.
      </p>

      <h2 className={H2}>What we collect</h2>
      <p className={P}>
        We collect the minimum needed to run a learning service and to know whether the episodes
        actually work:
      </p>
      <ul className={UL}>
        <li>
          <strong className="text-ink">Email address.</strong> Used to sign you in, verify your
          account, and send service messages such as billing and security notices.
        </li>
        <li>
          <strong className="text-ink">Nickname.</strong> Your public identity on the platform. It
          is the only name other learners ever see. We do not ask for, or store, your legal name.
        </li>
        <li>
          <strong className="text-ink">Avatar choice.</strong> A colour you pick from a fixed set.
          We do not accept uploaded photographs.
        </li>
        <li>
          <strong className="text-ink">Age range.</strong> A band, not a date of birth - enough to
          confirm the 16+ requirement and to report aggregate demographics.
        </li>
        <li>
          <strong className="text-ink">Activity events.</strong> Which items you opened, roughly how
          far through a video you got, likes, bookmarks, comments, quiz attempts and streak days.
        </li>
        <li>
          <strong className="text-ink">Organisation.</strong> Inferred from your email domain when
          it matches a registered cohort, so we can show aggregate counts.
        </li>
      </ul>
      <p className={P}>
        We do not collect your contacts, your location beyond coarse country, or anything you type
        into other applications. We do not sell personal information to anyone, at any price.
      </p>

      <h2 className={H2}>Your cohort, and who can see that you are here</h2>
      <p className={P}>
        Being visible to colleagues is <strong className="text-ink">off by default</strong> and is
        opt-in. While it is off, nobody at your organisation can see your nickname, your points,
        your comments-to-content links, or the fact that you have an account at all. Turning it on
        publishes your nickname and points to your cohort leaderboard, and nothing else. You can
        turn it back off at any time and the change takes effect immediately.
      </p>
      <p className={P}>
        By default your organisation sees only aggregate counts - how many people from that domain
        have registered and how many were active recently. To prevent re-identification in small
        groups, any count below five is suppressed and shown as “fewer than 5” rather than an exact
        number.
      </p>

      <h2 className={H2}>What organisation administrators can and cannot see</h2>
      <p className={P}>
        Administrators of an organisation cohort see aggregate analytics only: registration counts,
        active-user counts, and category-level interest across the cohort. They never see:
      </p>
      <ul className={UL}>
        <li>Which episodes a named individual has watched, or how far through.</li>
        <li>Individual quiz answers or quiz scores.</li>
        <li>Individual viewing history, bookmarks or search activity.</li>
        <li>The identity of anyone who has not opted into cohort visibility.</li>
      </ul>
      <p className={P}>
        If an administrator asks us for individual-level data, we will decline. There is no support
        path, no export and no paid tier that produces it.
      </p>

      <h2 className={H2}>Cookies and analytics</h2>
      <p className={P}>
        Essential cookies keep you signed in and remember your consent choice. They cannot be turned
        off without breaking sign-in. Analytics cookies are optional and are only set if you accept
        them on the consent banner; declining costs you nothing and hides nothing.
      </p>
      <p className={P}>
        Analytics tell us which episodes are finished and which are abandoned, so we know what to make
        more of. They are not used to build advertising profiles, and we do not run third-party
        advertising or tracking pixels on the platform. You can change your choice at any time by
        clearing site data and reloading.
      </p>

      <h2 className={H2}>Where your data is held</h2>
      <p className={P}>
        Data is hosted on Amazon Web Services in the Asia Pacific (Sydney) region, ap-southeast-2,
        within Australia. Backups stay in the same region. Some support tooling and email delivery
        may process your email address outside Australia; where that happens the provider is bound
        by contract to equivalent protections.
      </p>

      <h2 className={H2}>How long we keep it</h2>
      <p className={P}>
        Account details are kept while your account is open. Activity events are retained for up to
        24 months, after which they are aggregated and the individual records are discarded.
        Comments remain visible until you delete them or a moderator removes them.
      </p>

      <h2 className={H2}>Getting your data out, and having it deleted</h2>
      <p className={P}>
        You can export everything we hold about you as a JSON file from Settings, at any time,
        without asking us first. You can also delete your account from the same screen.
      </p>
      <p className={P}>
        Deletion anonymises your account immediately - your nickname is released, your comments are
        detached from you, and you disappear from every cohort count. The underlying records are
        hard-deleted from live systems and backups within 30 days. After that window they cannot be
        recovered, including by us.
      </p>
      <p className={P}>
        If you are in a jurisdiction with additional rights - correction, restriction, objection, or
        complaint to a regulator - those rights apply and we will not ask you to justify using them.
      </p>

      <h2 className={H2}>Age requirement</h2>
      <p className={P}>
        {BRAND.name} is for people aged 16 and over. We do not knowingly create accounts for anyone
        younger. If we learn that an account belongs to someone under 16, we close it and delete the
        associated data.
      </p>

      <h2 className={H2}>Security</h2>
      <p className={P}>
        Data is encrypted in transit and at rest. Access to production data is limited to the small
        number of staff who need it to operate the service, and that access is logged. If a breach
        affects your data in a way likely to cause you harm, we will tell you directly and promptly
        rather than burying it in a status page.
      </p>

      <h2 className={H2}>Changes to this policy</h2>
      <p className={P}>
        If we change anything material - particularly what we collect or who can see it - we will
        say so in-product before the change takes effect, not only by updating the date at the top
        of this page.
      </p>

      <h2 className={H2}>Contact</h2>
      <p className={P}>
        Privacy questions and requests: [privacy contact to be confirmed]. Postal address: [company
        address to be confirmed]. These placeholders will be replaced with real details before the
        service is offered publicly.
      </p>
    </LegalPage>
  );
}
