// PROVISIONAL — replace with business-plan Appendix B list; founder review
// required.
//
// LEARN_AI_V1_BUILD_SPEC.md §12 T02 says the content_sources seed comes from
// "Appendix B of the business plan". That appendix is not available in this
// repo. Per the T02 controller decision, this is a provisional list of real,
// working AI-news/technique sources with real RSS feed URLs, spanning all
// three source tiers (§5.4):
//   tier 1 — primary/official vendor & institutional blogs (draft directly)
//   tier 2 — quality independent reporting (draft allowed, verification
//            checkbox required in the reviewer UI)
//   tier 3 — aggregators/social (never drafted from — idea prompts only)
//
// Verticals are provisionally set to 'general' for every row: this is a
// generic AI-news source list, not a business-plan-curated, vertical-mapped
// one. Re-mapping specific sources to teaching/marketing/management/health
// verticals is part of the founder review this list requires.
export interface ContentSourceSeed {
  name: string;
  homepage_url: string;
  feed_url: string;
  tier: 1 | 2 | 3;
  vertical: "general";
  ingest_method: "rss";
  poll_interval_min: number;
}

const TIER1: readonly ContentSourceSeed[] = [
  {
    name: "Anthropic News",
    homepage_url: "https://www.anthropic.com/news",
    feed_url: "https://www.anthropic.com/rss.xml",
    tier: 1,
    vertical: "general",
    ingest_method: "rss",
    poll_interval_min: 120,
  },
  {
    name: "OpenAI News",
    homepage_url: "https://openai.com/news/",
    feed_url: "https://openai.com/news/rss.xml",
    tier: 1,
    vertical: "general",
    ingest_method: "rss",
    poll_interval_min: 120,
  },
  {
    name: "Google AI Blog",
    homepage_url: "https://blog.google/technology/ai/",
    feed_url: "https://blog.google/technology/ai/rss/",
    tier: 1,
    vertical: "general",
    ingest_method: "rss",
    poll_interval_min: 120,
  },
  {
    name: "AWS Machine Learning Blog",
    homepage_url: "https://aws.amazon.com/blogs/machine-learning/",
    feed_url: "https://aws.amazon.com/blogs/machine-learning/feed/",
    tier: 1,
    vertical: "general",
    ingest_method: "rss",
    poll_interval_min: 120,
  },
  {
    name: "Microsoft AI Blog",
    homepage_url: "https://blogs.microsoft.com/ai/",
    feed_url: "https://blogs.microsoft.com/ai/feed/",
    tier: 1,
    vertical: "general",
    ingest_method: "rss",
    poll_interval_min: 120,
  },
  {
    name: "Hugging Face Blog",
    homepage_url: "https://huggingface.co/blog",
    feed_url: "https://huggingface.co/blog/feed.xml",
    tier: 1,
    vertical: "general",
    ingest_method: "rss",
    poll_interval_min: 180,
  },
  {
    name: "arXiv — cs.AI (new submissions)",
    homepage_url: "https://arxiv.org/list/cs.AI/recent",
    feed_url: "https://export.arxiv.org/rss/cs.AI",
    tier: 1,
    vertical: "general",
    ingest_method: "rss",
    poll_interval_min: 240,
  },
  {
    name: "CSIRO News",
    homepage_url: "https://www.csiro.au/en/news",
    feed_url: "https://www.csiro.au/en/news/all/rss",
    tier: 1,
    vertical: "general",
    ingest_method: "rss",
    poll_interval_min: 240,
  },
];

const TIER2: readonly ContentSourceSeed[] = [
  {
    name: "MIT Technology Review — AI",
    homepage_url: "https://www.technologyreview.com/topic/artificial-intelligence/",
    feed_url: "https://www.technologyreview.com/feed/",
    tier: 2,
    vertical: "general",
    ingest_method: "rss",
    poll_interval_min: 240,
  },
  {
    name: "Ars Technica — AI",
    homepage_url: "https://arstechnica.com/ai/",
    feed_url: "https://arstechnica.com/ai/feed/",
    tier: 2,
    vertical: "general",
    ingest_method: "rss",
    poll_interval_min: 240,
  },
  {
    name: "The Verge — AI",
    homepage_url: "https://www.theverge.com/ai-artificial-intelligence",
    feed_url: "https://www.theverge.com/ai-artificial-intelligence/rss/index.xml",
    tier: 2,
    vertical: "general",
    ingest_method: "rss",
    poll_interval_min: 240,
  },
  {
    name: "Simon Willison's Weblog",
    homepage_url: "https://simonwillison.net/",
    feed_url: "https://simonwillison.net/atom/everything/",
    tier: 2,
    vertical: "general",
    ingest_method: "rss",
    poll_interval_min: 240,
  },
  {
    name: "Ben's Bites",
    homepage_url: "https://bensbites.beehiiv.com/",
    feed_url: "https://bensbites.beehiiv.com/rss",
    tier: 2,
    vertical: "general",
    ingest_method: "rss",
    poll_interval_min: 240,
  },
  {
    name: "The Decoder",
    homepage_url: "https://the-decoder.com/",
    feed_url: "https://the-decoder.com/feed/",
    tier: 2,
    vertical: "general",
    ingest_method: "rss",
    poll_interval_min: 240,
  },
  {
    name: "iTnews — Technology (AI coverage)",
    homepage_url: "https://www.itnews.com.au/",
    feed_url: "https://www.itnews.com.au/rss.ashx",
    tier: 2,
    vertical: "general",
    ingest_method: "rss",
    poll_interval_min: 240,
  },
  {
    name: "InnovationAus",
    homepage_url: "https://www.innovationaus.com/",
    feed_url: "https://www.innovationaus.com/feed/",
    tier: 2,
    vertical: "general",
    ingest_method: "rss",
    poll_interval_min: 240,
  },
];

const TIER3: readonly ContentSourceSeed[] = [
  {
    name: "Hacker News — search: AI",
    homepage_url: "https://hn.algolia.com/?q=AI",
    feed_url: "https://hnrss.org/newest?q=AI",
    tier: 3,
    vertical: "general",
    ingest_method: "rss",
    poll_interval_min: 360,
  },
  {
    name: "Hacker News — Show HN",
    homepage_url: "https://news.ycombinator.com/show",
    feed_url: "https://hnrss.org/show",
    tier: 3,
    vertical: "general",
    ingest_method: "rss",
    poll_interval_min: 360,
  },
  {
    name: "Reddit — r/artificial",
    homepage_url: "https://www.reddit.com/r/artificial/",
    feed_url: "https://www.reddit.com/r/artificial/.rss",
    tier: 3,
    vertical: "general",
    ingest_method: "rss",
    poll_interval_min: 360,
  },
  {
    name: "Reddit — r/MachineLearning",
    homepage_url: "https://www.reddit.com/r/MachineLearning/",
    feed_url: "https://www.reddit.com/r/MachineLearning/.rss",
    tier: 3,
    vertical: "general",
    ingest_method: "rss",
    poll_interval_min: 360,
  },
  {
    name: "Reddit — r/OpenAI",
    homepage_url: "https://www.reddit.com/r/OpenAI/",
    feed_url: "https://www.reddit.com/r/OpenAI/.rss",
    tier: 3,
    vertical: "general",
    ingest_method: "rss",
    poll_interval_min: 360,
  },
  {
    name: "Reddit — r/LocalLLaMA",
    homepage_url: "https://www.reddit.com/r/LocalLLaMA/",
    feed_url: "https://www.reddit.com/r/LocalLLaMA/.rss",
    tier: 3,
    vertical: "general",
    ingest_method: "rss",
    poll_interval_min: 360,
  },
  {
    name: "Reddit — r/singularity",
    homepage_url: "https://www.reddit.com/r/singularity/",
    feed_url: "https://www.reddit.com/r/singularity/.rss",
    tier: 3,
    vertical: "general",
    ingest_method: "rss",
    poll_interval_min: 360,
  },
  {
    name: "Product Hunt — Artificial Intelligence",
    homepage_url: "https://www.producthunt.com/topics/artificial-intelligence",
    feed_url: "https://www.producthunt.com/topics/artificial-intelligence.rss",
    tier: 3,
    vertical: "general",
    ingest_method: "rss",
    poll_interval_min: 360,
  },
  {
    name: "Techmeme",
    homepage_url: "https://www.techmeme.com/",
    feed_url: "https://www.techmeme.com/feed.xml",
    tier: 3,
    vertical: "general",
    ingest_method: "rss",
    poll_interval_min: 360,
  },
  {
    name: "Slashdot",
    homepage_url: "https://slashdot.org/",
    feed_url: "https://rss.slashdot.org/Slashdot/slashdotMain",
    tier: 3,
    vertical: "general",
    ingest_method: "rss",
    poll_interval_min: 360,
  },
];

export const CONTENT_SOURCES: readonly ContentSourceSeed[] = [...TIER1, ...TIER2, ...TIER3];
