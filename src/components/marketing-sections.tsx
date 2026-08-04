import Link from "next/link";
import {
  ArrowRight,
  CircleCheck,
  Flame,
  MonitorPlay,
  Newspaper,
  Sparkles,
  Users,
} from "lucide-react";
import { ContentCard } from "@/components/content-card";
import {
  type PublicTopicCard,
  freeStarterTopics,
  latestUpdates,
  newestTopics,
  publicCategories,
  trendingTopics,
} from "@/lib/public-content";

/* ---------- Browse by topic ---------- */

export async function BrowseTopics() {
  const topics = await publicCategories();

  return (
    <section
      aria-labelledby="topics-heading"
      className="mx-auto page-container px-4 py-12 sm:px-6 sm:py-14"
    >
      <h2 id="topics-heading" className="text-2xl sm:text-3xl">
        Browse by topic
      </h2>

      <ul className="mt-5 grid grid-cols-2 gap-2 sm:mt-7 sm:gap-3 lg:grid-cols-3">
        {topics.map((topic) => (
          <li key={topic.id} className="flex">
            <Link
              href="/feed"
              className="group flex h-full w-full items-start gap-2.5 rounded-card border border-line bg-surface p-3 transition-colors hover:border-line-strong sm:gap-3 sm:p-4"
            >
              <span
                aria-hidden="true"
                className="mt-1.5 size-2.5 shrink-0 rounded-full"
                style={{ background: topic.color_hex ?? "#202020" }}
              />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-ink sm:text-base">
                  {topic.name}
                </span>
                {/* Description is desktop-only - the name carries it on mobile. */}
                <span className="mt-0.5 hidden text-sm leading-relaxed text-ink-muted sm:block">
                  {topic.description}
                </span>
                <span className="mt-1 block text-xs text-ink-faint">
                  {topic.topic_count} topic{topic.topic_count === 1 ? "" : "s"}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ---------- Shared rail: horizontal on mobile, grid on desktop ---------- */

function ContentRail({
  id,
  eyebrow,
  icon: Icon,
  title,
  description,
  items,
}: {
  id: string;
  eyebrow: string;
  icon: typeof Flame;
  title: string;
  description: string;
  items: PublicTopicCard[];
}) {
  return (
    <section aria-labelledby={`${id}-heading`}>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="max-w-2xl">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.08em] text-[#816729]">
            <Icon className="size-3.5" aria-hidden="true" />
            {eyebrow}
          </p>
          <h2 id={`${id}-heading`} className="mt-1.5 text-2xl sm:text-3xl">
            {title}
          </h2>
          {/* Section blurbs are desktop-only - the heading says enough on mobile. */}
          <p className="mt-2 hidden text-lg text-ink-muted sm:block">{description}</p>
        </div>
        <Link
          href="/feed"
          className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-ink hover:text-ink-muted sm:text-base"
        >
          See all
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>

      <ul className="rail -mx-4 mt-6 flex snap-x gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:snap-none sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4">
        {items.map((item) => (
          <li key={item.id} className="flex w-72 shrink-0 snap-start sm:w-auto">
            <ContentCard topic={item} compact />
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ---------- Latest in AI (articles) ---------- */

export async function LatestUpdates() {
  const updates = await latestUpdates(4);
  if (updates.length === 0) return null;

  return (
    <div className="mx-auto page-container px-4 py-12 sm:px-6 sm:py-14">
      <ContentRail
        id="latest-updates"
        eyebrow="Just published"
        icon={Newspaper}
        title="Latest in AI"
        description="Short, human-reviewed updates — what changed and why it matters."
        items={updates}
      />
    </div>
  );
}

/* ---------- Trending + newest + free starters ---------- */

export async function DiscoverySections() {
  // Topics only for now - articles get their own page later.
  const [trending, newest, starters] = await Promise.all([
    trendingTopics(4),
    newestTopics(4),
    freeStarterTopics(3),
  ]);

  return (
    <div className="border-y border-line bg-band">
      <div className="mx-auto flex page-container flex-col gap-10 px-4 py-12 sm:gap-16 sm:px-6 sm:py-16">
        <ContentRail
          id="trending"
          eyebrow="Most watched this week"
          icon={Flame}
          title="What everyone is learning right now"
          description="The topics your peers opened most in the last seven days."
          items={trending}
        />

        <ContentRail
          id="newest"
          eyebrow="Fresh this week"
          icon={Sparkles}
          title="New topics"
          description="New topics land every few days, always human-reviewed before they publish."
          items={newest}
        />

        {/* Free starter set */}
        <section aria-labelledby="free-heading">
          <div className="rounded-card border border-line bg-surface p-5 sm:p-8">
            <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
              <div className="max-w-2xl">
                <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.08em] text-[#816729]">
                  <CircleCheck className="size-3.5" aria-hidden="true" />
                  Free - no card
                </p>
                <h2 id="free-heading" className="mt-1.5 text-2xl sm:text-3xl">
                  Start with these three
                </h2>
                <p className="mt-2 text-ink-muted sm:text-lg">Fifteen minutes total.</p>
              </div>
              <Link
                href="/signup"
                className="inline-flex min-h-12 items-center gap-2 rounded-md bg-primary px-6 font-semibold text-on-primary transition-colors hover:bg-primary-strong"
              >
                Start free
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </div>

            <ol className="mt-5 grid gap-3 sm:mt-6 sm:grid-cols-3 sm:gap-4">
              {starters.map((item, i) => (
                <li key={item.id} className="flex gap-3">
                  <span
                    aria-hidden="true"
                    className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm tabular-nums text-ink sm:size-8"
                  >
                    {i + 1}
                  </span>
                  <Link
                    href={`/content/${item.slug}`}
                    className="min-w-0 text-sm font-semibold leading-snug text-ink hover:underline sm:text-base"
                  >
                    {item.title}
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </div>
    </div>
  );
}

/* ---------- How it works ---------- */

const STEPS = [
  {
    icon: Users,
    title: "Sign up with your work email",
    body: "You join your organisation's cohort automatically.",
  },
  {
    icon: MonitorPlay,
    title: "Watch one episode a day",
    body: "Under five minutes, captioned, human-reviewed.",
  },
  {
    icon: CircleCheck,
    title: "Prove it stuck",
    body: "A quiz after each episode. Your scores stay private.",
  },
];

export function HowItWorks() {
  return (
    <section
      aria-labelledby="how-heading"
      className="mx-auto page-container px-4 py-12 sm:px-6 sm:py-16"
    >
      <h2 id="how-heading" className="text-center text-2xl sm:text-3xl">
        How it works
      </h2>
      <ol className="mt-6 grid gap-3 sm:mt-10 sm:gap-6 md:grid-cols-3">
        {STEPS.map(({ icon: Icon, title, body }, i) => (
          <li
            key={title}
            className="relative flex h-full items-start gap-3 rounded-card border border-line bg-surface p-4 sm:flex-col sm:gap-0 sm:p-6"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-soft sm:size-11">
              <Icon className="size-5 text-primary-strong sm:size-6" aria-hidden="true" />
            </span>
            <div className="min-w-0 sm:mt-4">
              <h3 className="font-display text-base sm:text-lg">
                <span aria-hidden="true" className="mr-1.5 tabular-nums text-ink-faint">
                  {i + 1}.
                </span>
                {title}
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-ink-muted sm:mt-2 sm:text-base">
                {body}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
