/**
 * Sample-data layer — UI Phase 1 (design-system + app shell + daily brief)
 * is UI-FIRST and renders entirely from these fixtures. Nothing here talks
 * to `@learn-ai/db` or any `/api/v1/*` route. Field names mirror
 * LEARN_AI_V1_BUILD_SPEC.md §3 (snake_case in the SQL, camelCase here —
 * the spec explicitly allows that translation).
 *
 * `lib/data-source.ts` is the ONLY module pages should import from — it
 * re-exports accessors backed by this file today, and becomes the real
 * `api-client`-backed swap point once the backend is wired up.
 */

export type Vertical = "general" | "teaching" | "learning" | "marketing" | "management" | "health";
export type ContentKind = "news" | "technique" | "video" | "prompt";
export type ContentStatus =
  | "draft"
  | "in_review"
  | "changes_requested"
  | "approved"
  | "scheduled"
  | "published"
  | "rejected"
  | "archived";
export type AuthorKind = "agent" | "human";
export type UserRole = "member" | "reviewer" | "admin";
export type UserTier = "free" | "premium";
export type CohortTrack = "organisation" | "individual";
export type SendCadence = "daily" | "weekly" | "none";

export interface ContentSource {
  id: string;
  name: string;
  homepageUrl: string;
  tier: 1 | 2 | 3;
  vertical: Vertical;
}

export interface ContentItem {
  id: string;
  editionId: string | null;
  kind: ContentKind;
  title: string;
  slug: string;
  bodyMd: string;
  /** <= 200 chars, for cards and meta. */
  summary: string;
  vertical: Vertical;
  videoDurationS?: number;
  videoCaptionsUrl?: string;
  /** primary source, required for kind='news' */
  sourceUrl?: string;
  sourceId?: string;
  sourceTier?: 1 | 2 | 3;
  status: ContentStatus;
  isPremium: boolean;
  authorKind: AuthorKind;
  approvedBy?: string;
  approvedAt?: string;
  secondApprovedBy?: string;
  secondApprovedAt?: string;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Edition {
  id: string;
  editionDate: string; // ISO date, e.g. "2026-08-15"
  headline: string;
  status: "planning" | "in_review" | "approved" | "published";
  publishedAt?: string;
  items: ContentItem[]; // exactly one news, one technique, one video for a complete brief
}

export interface Prompt {
  id: string;
  title: string;
  body: string;
  vertical: Vertical;
  jobRole?: string;
  isPremium: boolean;
  contentItemId?: string;
}

export interface Organisation {
  id: string;
  name: string;
  slug: string;
  primaryDomain: string;
  kind: string; // 'university' | 'government' | 'corporate' | 'sme'
  memberCount: number;
  autoCreated: boolean;
  claimedBy?: string;
}

export interface Colleague {
  id: string;
  displayName: string;
  currentStreak: number;
  showInCohort: boolean;
}

export interface UserPreferences {
  cadence: SendCadence;
  sendHourLocal: number;
  verticals: Vertical[]; // empty = all
  pushEnabled: boolean;
}

export interface CurrentUser {
  id: string;
  displayName: string;
  email: string;
  role: UserRole;
  tier: UserTier;
  organisationId: string;
  cohortTrack: CohortTrack;
  jobRole: string;
  timezone: string;
  currentStreak: number;
  longestStreak: number;
  preferences: UserPreferences;
}

export interface ReviewQueueItem extends ContentItem {
  requiresSecondApproval: boolean;
  tierTwoVerificationRequired: boolean;
  submittedAt: string;
}

export interface MetricPoint {
  date: string; // ISO date
  value: number;
}

export interface AdminMetrics {
  signupsPerDay: MetricPoint[];
  opensPerDay: MetricPoint[];
  completionsPerDay: MetricPoint[];
  reviewTimeMinutesPerDay: MetricPoint[];
}

// ---------------------------------------------------------------------------
// Content sources (§3.4)
// ---------------------------------------------------------------------------

export const contentSources: ContentSource[] = [
  {
    id: "src-afr",
    name: "Australian Financial Review",
    homepageUrl: "https://www.afr.com",
    tier: 1,
    vertical: "general",
  },
  {
    id: "src-abc",
    name: "ABC News",
    homepageUrl: "https://www.abc.net.au/news",
    tier: 1,
    vertical: "general",
  },
  {
    id: "src-itnews",
    name: "iTnews",
    homepageUrl: "https://www.itnews.com.au",
    tier: 1,
    vertical: "general",
  },
  {
    id: "src-caudit",
    name: "CAUDIT",
    homepageUrl: "https://www.caudit.edu.au",
    tier: 1,
    vertical: "teaching",
  },
  {
    id: "src-smartcompany",
    name: "SmartCompany",
    homepageUrl: "https://www.smartcompany.com.au",
    tier: 2,
    vertical: "marketing",
  },
  {
    id: "src-ahri",
    name: "Australian HR Institute",
    homepageUrl: "https://www.ahri.com.au",
    tier: 1,
    vertical: "management",
  },
  {
    id: "src-racgp",
    name: "RACGP newsGP",
    homepageUrl: "https://www1.racgp.org.au/newsgp",
    tier: 1,
    vertical: "health",
  },
];

// ---------------------------------------------------------------------------
// Editions — 10 publishing days back from today (2026-08-15)
// ---------------------------------------------------------------------------

function iso(date: string): string {
  return `${date}T21:00:00Z`; // published evening-before AEST for a 7am local send
}

interface EditionSeed {
  date: string;
  vertical: Vertical;
  headline: string;
  news: {
    title: string;
    summary: string;
    bodyMd: string;
    sourceId: string;
    sourceUrl: string;
    sourceTier: 1 | 2 | 3;
  };
  technique: { title: string; summary: string; bodyMd: string };
  video: { title: string; summary: string; bodyMd: string; durationS: number };
}

const editionSeeds: EditionSeed[] = [
  {
    date: "2026-08-06",
    vertical: "general",
    headline: "The productivity gain is real — but only after the second draft",
    news: {
      title: "Australian Signals Directorate updates guidance on AI tool vetting",
      summary:
        "ASD's revised guidance asks agencies to document which AI assistants staff use, not just block or allow them outright.",
      bodyMd:
        "The Australian Signals Directorate has revised its guidance on workplace AI tools, moving away from a blanket allow-or-block approach toward asset-style tracking: agencies must record which assistants staff actually use, where data is processed, and how long it's retained.\n\nFor most workplaces the shift is administrative rather than technical — a register, not a rebuild. But it does mean the tool you quietly started using six months ago now needs a line in a spreadsheet somewhere. If your organisation hasn't asked yet, it's worth flagging before it asks you.",
      sourceId: "src-itnews",
      sourceUrl: "https://www.itnews.com.au/news/asd-updates-ai-tool-guidance-2026",
      sourceTier: 1,
    },
    technique: {
      title: "Turn a messy meeting transcript into three clean actions",
      summary: "A copy-paste prompt that separates decisions, owners and open questions from a raw transcript.",
      bodyMd:
        "Meeting transcripts are long, repetitive and full of half-finished sentences. Most people either skip re-reading them entirely or spend twenty minutes doing it by hand. This prompt does it in under a minute.\n\n**Steps**\n\n1. Export the transcript as plain text (most call tools have a \"copy transcript\" option).\n2. Paste it into the prompt below, replacing the placeholder.\n3. Check the owners it assigns — it infers them from who spoke, which is usually right but not always.\n4. Paste the output straight into your notes app.\n\n```\nHere is a raw meeting transcript. Produce three short sections:\n1. Decisions made (one line each, no elaboration)\n2. Action items with an owner and, if mentioned, a date\n3. Open questions nobody answered\n\nDo not summarise the discussion itself — only these three lists.\n\nTranscript:\n<paste transcript here>\n```\n\nThe last instruction matters: without it, most assistants pad the output with a discussion recap you didn't ask for.",
    },
    video: {
      title: "Setting up Copilot in Outlook without breaking your signature",
      summary: "A four-minute walkthrough of enabling and configuring the Outlook AI assistant.",
      bodyMd:
        "**0:00** Where the assistant toggle actually lives (it moved twice in the last year).\n**0:45** Turning off auto-suggest in the compose window if you find it distracting — this is one click, not a policy setting.\n**1:40** Why your saved signature sometimes gets swallowed into a draft, and the one setting that fixes it.\n**2:50** Using it to shorten a reply thread without losing the ask.\n**4:10** A 20-second sanity check before you hit send on anything it wrote.",
      durationS: 268,
    },
  },
  {
    date: "2026-08-07",
    vertical: "teaching",
    headline: "Universities stop asking 'did a student use AI' and start asking 'how'",
    news: {
      title: "CAUDIT releases shared assessment-redesign framework for member universities",
      summary:
        "A joint framework from Australia's university IT directors reframes AI-era assessment around process evidence, not detection tools.",
      bodyMd:
        "CAUDIT, the peak body for university IT leadership in Australia and New Zealand, has published a shared framework for redesigning assessment tasks in a generative-AI era. Rather than doubling down on detection software — which member institutions privately admit has a high false-positive rate — the framework asks academics to build process evidence into tasks: drafts, annotated sources, in-class defence of written work.\n\nFor teaching staff, the practical shift is less about banning tools and more about redesigning what's being marked. Several pilot units already report fewer integrity cases simply because the assessment no longer rewards a single polished output.",
      sourceId: "src-caudit",
      sourceUrl: "https://www.caudit.edu.au/resources/assessment-redesign-framework-2026",
      sourceTier: 1,
    },
    technique: {
      title: "Build a rubric-aligned feedback draft in one pass",
      summary: "Feed a rubric and a submission together so feedback cites the actual criteria, not generic praise.",
      bodyMd:
        "Generic AI feedback (\"well structured, consider adding more detail\") wastes a student's time and yours. The fix is to give the assistant your rubric, not just the submission.\n\n**Steps**\n\n1. Paste your rubric criteria as a short list — wording from your own marking guide, not a generic one.\n2. Paste the student submission underneath.\n3. Ask for feedback tied to each criterion by name.\n4. Read it before sending — it drafts a starting point, it doesn't replace your judgement on the mark.\n\n```\nHere is a marking rubric with three criteria, then a student submission.\nFor each criterion, write one or two sentences of feedback that refers\nspecifically to something in the submission — not general advice.\nDo not suggest a grade or mark.\n\nRubric:\n<paste your criteria>\n\nSubmission:\n<paste student work>\n```\n\nAsking it not to suggest a grade keeps the assessment decision where it belongs — with you.",
    },
    video: {
      title: "Marking a stack of essays faster without losing your voice in the feedback",
      summary: "How to use a structured prompt as a first pass, then edit in your own tone.",
      bodyMd:
        "**0:00** Why a first-pass draft beats a blank page, even when you'll rewrite half of it.\n**1:10** Pasting a rubric once and reusing it across a whole cohort's submissions.\n**2:20** The one edit every academic in this pilot made to the AI draft: shortening it.\n**3:15** Keeping a consistent voice across 40 sets of feedback.\n**4:40** Where this breaks down — borderline fail grades still need your full attention, not a shortcut.",
      durationS: 301,
    },
  },
  {
    date: "2026-08-08",
    vertical: "marketing",
    headline: "The ad regulator wants a label. Most brands don't have one yet.",
    news: {
      title: "AANA updates advertising code guidance on AI-generated content disclosure",
      summary:
        "The Australian Association of National Advertisers has clarified when AI-generated imagery and copy need to be labelled in consumer-facing ads.",
      bodyMd:
        "The Australian Association of National Advertisers has issued updated guidance under its Code of Ethics clarifying when AI-generated or AI-modified content in advertising needs disclosure. The trigger isn't \"was AI involved anywhere\" — it's whether the result misrepresents a real person, product capability or outcome a reasonable consumer would assume is genuine.\n\nA synthetic background is unlikely to need a label; a synthetic customer testimonial almost certainly does. Marketing teams running AI-assisted campaigns should check their current asset library against the updated examples in the guidance, particularly anything using AI-generated \"customers\" or before/after imagery.",
      sourceId: "src-smartcompany",
      sourceUrl: "https://www.smartcompany.com.au/marketing/aana-ai-disclosure-guidance-2026",
      sourceTier: 2,
    },
    technique: {
      title: "Turn a one-line campaign idea into a full brief",
      summary: "A prompt that forces the assistant to ask clarifying questions before drafting the brief.",
      bodyMd:
        "The fastest way to get a mediocre campaign brief is to ask for one directly — the assistant fills gaps with generic assumptions. Making it ask you first fixes that.\n\n**Steps**\n\n1. State your one-line idea.\n2. Ask it to list clarifying questions before drafting anything.\n3. Answer the questions in a follow-up message.\n4. Ask for the brief only after that exchange.\n\n```\nI have a one-line campaign idea: <your idea>.\n\nBefore drafting a brief, ask me up to 6 clarifying questions covering\naudience, budget tier, channel, timeline and the single metric that\nwould make this a success. Do not draft the brief yet.\n```\n\nThis takes two extra minutes and produces a brief you can actually hand to a designer without a follow-up meeting.",
    },
    video: {
      title: "From brand brief to five ad copy variants in one sitting",
      summary: "A real campaign brief turned into headline and body copy options, then trimmed down to two.",
      bodyMd:
        "**0:00** The brief we're starting from — a real (anonymised) client brief.\n**0:50** Asking for five distinct angles, not five phrasings of the same angle.\n**2:00** Why we set a hard character limit before generating, not after.\n**3:05** Cutting five down to two using the brief's own success metric.\n**4:15** The disclosure question — does this campaign need an AI-content label under AANA guidance.",
      durationS: 292,
    },
  },
  {
    date: "2026-08-09",
    vertical: "management",
    headline: "Managers are the bottleneck in AI adoption, not the tools",
    news: {
      title: "AHRI survey: ASX 200 firms report management readiness as the top AI adoption barrier",
      summary:
        "The Australian HR Institute's latest survey finds line-manager confidence, not tool access, is the biggest handbrake on AI adoption.",
      bodyMd:
        "A survey of HR leaders across ASX 200 companies, published by the Australian HR Institute, finds that tool access is no longer the main barrier to workplace AI adoption — most staff already have something. The handbrake is line-manager confidence: fewer than a third of managers surveyed said they felt equipped to coach a direct report on using AI tools appropriately in their role.\n\nThe report's recommendation is unglamorous but specific: give managers a short, role-relevant example before asking them to sponsor the rollout to their team, rather than a generic all-staff training session.",
      sourceId: "src-ahri",
      sourceUrl: "https://www.ahri.com.au/research/asx200-ai-adoption-survey-2026",
      sourceTier: 1,
    },
    technique: {
      title: "Prep a one-on-one in five minutes, not thirty",
      summary: "A prompt that turns scattered notes and recent updates into a focused agenda.",
      bodyMd:
        "Most one-on-ones lose value not because managers don't care, but because prep gets squeezed out. This turns whatever notes you already have into a usable agenda.\n\n**Steps**\n\n1. Gather what you already have — Slack DMs, project updates, last meeting's notes.\n2. Paste it in, unedited.\n3. Ask for three discussion topics, ranked by what's time-sensitive.\n4. Add one personal check-in item yourself — the assistant won't know what matters there.\n\n```\nHere are my scattered notes about a direct report since our last\none-on-one: project updates, messages, and anything flagged. Suggest\nthree agenda topics ranked by time-sensitivity, each with a one-line\nreason. Do not write the whole conversation script.\n```\n\nKeep it to three topics — a longer list turns a one-on-one into a status meeting.",
    },
    video: {
      title: "Running a 30-minute team retro with AI-assisted notes",
      summary: "Capturing a retro live, then turning raw notes into three commitments before people leave the room.",
      bodyMd:
        "**0:00** Why typed notes beat a recording for a retro — no transcription lag.\n**0:40** A simple two-column running note: what's working, what's not.\n**1:50** Turning that into three commitments before the meeting ends, live.\n**3:10** Assigning owners in the room, not after — accountability drops fast otherwise.\n**4:20** Sending the summary within the hour, while it's still fresh.",
      durationS: 258,
    },
  },
  {
    date: "2026-08-10",
    vertical: "general",
    headline: "Australia's AI infrastructure bill just got a lot more local",
    news: {
      title: "AWS opens second Sydney availability zone for Bedrock model hosting",
      summary:
        "A second Sydney region for AWS Bedrock means more workplace AI tools can now keep model inference data onshore by default.",
      bodyMd:
        "Amazon Web Services has opened a second Sydney availability zone offering Bedrock model hosting, giving Australian software vendors an onshore option for AI features that previously routed inference requests through Singapore or the US. For procurement teams, the practical effect is a shorter answer to the \"where does our data go\" question in vendor security questionnaires.\n\nIt won't change which model a vendor uses, only where the request is processed. Worth asking your existing AI-enabled vendors whether they've switched their hosting region, since most won't announce it unprompted.",
      sourceId: "src-itnews",
      sourceUrl: "https://www.itnews.com.au/news/aws-sydney-bedrock-second-az-2026",
      sourceTier: 1,
    },
    technique: {
      title: "Summarise a long PDF without losing the caveats",
      summary: "A prompt that keeps qualifiers and limitations in a summary instead of flattening them out.",
      bodyMd:
        "Long reports usually bury the most important sentence — the one with \"however\" or \"subject to\" in it. A naive summary prompt drops those. This one doesn't.\n\n**Steps**\n\n1. Extract or paste the report text (or upload it if your tool supports files).\n2. Ask for a summary that explicitly preserves caveats and limitations as a separate list.\n3. Skim the caveats list first — it's usually shorter than the summary and more useful.\n4. Open the original at the page reference before you quote it to anyone else.\n\n```\nSummarise this report in 150 words. Then, separately, list every\ncaveat, limitation, or \"however\" statement the report makes, with a\npage or section reference if available. Do not fold caveats into the\nmain summary.\n```\n\nA summary without its caveats is a different document than the one you were given.",
    },
    video: {
      title: "Checking an AI summary against the source in under two minutes",
      summary: "A quick verification habit for anyone who forwards AI-summarised documents to others.",
      bodyMd:
        "**0:00** Why this two-minute check matters more once you start forwarding summaries to other people.\n**0:35** Spot-checking three claims against the source document.\n**1:40** What to do when a summary states a number the source doesn't contain — it happens more than you'd think.\n**2:50** A one-line disclaimer worth adding when you forward a summary on.\n**3:50** Building this into a habit rather than a one-off.",
      durationS: 244,
    },
  },
  {
    date: "2026-08-11",
    vertical: "learning",
    headline: "The upskilling budget is shifting from courses to coaching",
    news: {
      title: "L&D leaders report shift from AI courses to embedded coaching, industry survey finds",
      summary:
        "A learning-and-development industry survey finds standalone AI training courses are being replaced by shorter, role-embedded coaching sessions.",
      bodyMd:
        "An industry survey of learning-and-development leaders across Australian mid-to-large employers finds a clear shift away from standalone AI training courses toward shorter, role-embedded coaching — a 20-minute session tied to an employee's actual current task, rather than a half-day generic course.\n\nThe reported reason is retention: completion rates for the generic courses were high, but follow-up surveys found most staff couldn't recall a specific technique three months later. Role-embedded sessions, while more resource-intensive to run, showed markedly better recall in the same follow-up window.",
      sourceId: "src-ahri",
      sourceUrl: "https://www.ahri.com.au/research/ld-embedded-coaching-shift-2026",
      sourceTier: 1,
    },
    technique: {
      title: "Build a study plan around the time you actually have",
      summary: "A prompt that starts from your available hours, not an idealised course schedule.",
      bodyMd:
        "Most study plans assume more free time than anyone actually has. This one starts from your real constraints.\n\n**Steps**\n\n1. State the skill or topic, your deadline, and your realistic weekly hours — be honest, not aspirational.\n2. Ask for a plan broken into sessions no longer than your longest realistic block.\n3. Ask it to flag what gets cut first if a week goes sideways.\n4. Revisit the plan weekly rather than trying to follow it exactly.\n\n```\nI want to learn <topic> by <date>. I realistically have <N> hours a\nweek, in blocks no longer than <M> minutes. Build a week-by-week plan\nusing only that time, and tell me which sessions to skip first if a\nweek gets disrupted.\n```\n\nA plan that survives a bad week is more useful than a perfect one that doesn't.",
    },
    video: {
      title: "Turning a course outline into a five-question quiz",
      summary: "A quick method for L&D teams to build formative checks without a separate authoring tool.",
      bodyMd:
        "**0:00** Why a five-question check beats a twenty-question test for a short module.\n**0:50** Pasting in a course outline and asking for questions tied to specific sections.\n**2:00** Fixing the one thing every draft gets wrong: answer options that are too obviously wrong.\n**3:20** Exporting into a plain format any LMS can import.\n**4:05** A caution on relying on this for anything graded without a human review pass.",
      durationS: 276,
    },
  },
  {
    date: "2026-08-12",
    vertical: "general",
    headline: "Most 'AI policies' are one paragraph. Here's what the good ones have in common",
    news: {
      title: "Survey of ASX-listed AI usage policies finds most fit on a single page",
      summary:
        "A review of publicly available workplace AI policies among ASX-listed companies finds wide gaps between brief guidance and detailed frameworks.",
      bodyMd:
        "A review of publicly available workplace AI usage policies among ASX-listed companies found sharp variation: some run to a single paragraph covering little more than \"don't paste confidential data into public tools,\" while others detail approved tools, data classifications and an escalation path for edge cases.\n\nThe more detailed policies share a pattern worth copying regardless of company size: they name specific approved tools rather than describing AI generically, and they give employees a named contact for the \"is this okay?\" question rather than leaving it to individual judgement.",
      sourceId: "src-afr",
      sourceUrl: "https://www.afr.com/technology/asx-ai-policy-review-2026",
      sourceTier: 1,
    },
    technique: {
      title: "Turn a vague policy question into a specific one before you ask",
      summary: "A prompt that helps you frame a workplace AI-use question precisely before raising it with IT or your manager.",
      bodyMd:
        "\"Is this AI tool okay to use?\" is usually the wrong question to bring to IT — it's unanswerable as stated. This prompt helps you sharpen it first.\n\n**Steps**\n\n1. Describe the tool and the task you want to use it for, in plain terms.\n2. Ask the assistant to reframe your question around data sensitivity, not the tool's name.\n3. Take the reframed question to your actual policy contact — the assistant can't approve anything.\n4. Keep the reframed question on file; it's useful the next time too.\n\n```\nI want to use <tool> to do <task>, which involves <type of data>.\nReframe my question as a specific, answerable question about data\nsensitivity and approval, suitable for asking our IT or compliance\nteam. Do not answer whether it's allowed — I need to ask a person.\n```\n\nThe reframing is the useful part; the approval always has to come from a person.",
    },
    video: {
      title: "Reading your organisation's AI policy in five minutes flat",
      summary: "A method for extracting the three things that actually matter from a long policy document.",
      bodyMd:
        "**0:00** Why most people never finish reading their org's AI policy — and what that costs them later.\n**0:45** Asking for just three things: what's banned, what's approved, who to ask.\n**1:50** Cross-checking the answer against the actual document, not trusting it blind.\n**3:00** Where policies are silent — and why that's not the same as \"allowed\".\n**4:10** Bookmarking the policy contact so the next question takes thirty seconds, not a search.",
      durationS: 259,
    },
  },
  {
    date: "2026-08-13",
    vertical: "health",
    headline: "AI scribes are cutting GP documentation time — with strict limits attached",
    news: {
      title: "RACGP publishes updated position on AI scribe tools in general practice",
      summary:
        "The RACGP's updated guidance sets out where AI scribe tools help with clinic documentation load, and where clinician review remains mandatory.",
      bodyMd:
        "The Royal Australian College of General Practitioners has published an updated position statement on AI scribe tools — software that drafts consultation notes from a recorded conversation. Early adopting clinics report meaningful reductions in after-hours documentation time, sometimes described as the biggest single relief in a GP's admin load in years.\n\nThe guidance is firm on limits: every AI-drafted note must be reviewed and confirmed by the treating clinician before it's filed, patient consent must be recorded before any recording starts, and no scribe tool may be used for a clinical assessment or decision itself — only for documenting one a clinician has already made.",
      sourceId: "src-racgp",
      sourceUrl: "https://www1.racgp.org.au/newsgp/professional/ai-scribe-tools-position-2026",
      sourceTier: 1,
    },
    technique: {
      title: "Draft a plain-English appointment reminder, not a diagnosis",
      summary:
        "An administrative prompt for patient-facing scheduling text — deliberately scoped away from any clinical content.",
      bodyMd:
        "This is strictly an admin-side prompt: rewriting scheduling and logistics text so patients understand it. It does not touch clinical content, and shouldn't be adapted to.\n\n**Steps**\n\n1. Paste the current appointment reminder or intake instructions.\n2. Ask for a plain-English rewrite at a specified reading level.\n3. Have reception staff check it reads naturally before sending to patients.\n4. Never extend this pattern to clinical notes, results, or advice — that's a clinician's job, not a template's.\n\n```\nRewrite this patient appointment reminder in plain English at roughly\na Year 8 reading level. Keep all times, locations and preparation\ninstructions exactly as given — do not add or remove any instruction.\nThis is administrative text only, not clinical advice.\n```\n\nKeep the boundary explicit every time: administrative text in, administrative text out.",
    },
    video: {
      title: "How one Sydney clinic rolled out an AI scribe tool in a week",
      summary: "A practice manager walks through consent, setup and the review step that stayed non-negotiable.",
      bodyMd:
        "**0:00** The documentation backlog that pushed this clinic to trial a scribe tool.\n**0:55** Setting up patient consent as a spoken step before every recording.\n**2:10** What the draft note looks like before a clinician touches it.\n**3:20** The mandatory review step — and why it's enforced in software, not just policy.\n**4:45** Measured time saved per consultation after four weeks of use.",
      durationS: 312,
    },
  },
  {
    date: "2026-08-14",
    vertical: "marketing",
    headline: "The best AI-assisted campaigns still start with a human insight",
    news: {
      title: "Cannes case-study review finds AI-assisted campaigns still led by human strategy briefs",
      summary:
        "A review of recent award-shortlisted campaigns finds AI tools used for production and iteration, with the core insight still human-authored.",
      bodyMd:
        "A review of recently shortlisted advertising case studies found a consistent pattern behind the AI-assisted campaigns that performed best: the core strategic insight — the human tension the campaign is built around — was still written by a person, with AI tools used downstream for production speed and iteration volume, not for originating the idea.\n\nFor smaller marketing teams without a big production budget, the takeaway is encouraging: the leverage isn't in a better tool, it's in spending saved production time on a sharper brief.",
      sourceId: "src-smartcompany",
      sourceUrl: "https://www.smartcompany.com.au/marketing/cannes-case-study-review-2026",
      sourceTier: 2,
    },
    technique: {
      title: "Pressure-test a campaign insight before you brief anyone",
      summary: "A prompt that argues against your own campaign idea to find the weak point before a client does.",
      bodyMd:
        "The fastest way to strengthen an insight is to have something argue against it. This prompt makes the assistant play devil's advocate.\n\n**Steps**\n\n1. State your campaign insight in one or two sentences.\n2. Ask for the three strongest objections a sceptical client would raise.\n3. Answer each objection in writing — if you can't, the insight needs work.\n4. Only brief the team once the objections have real answers.\n\n```\nHere is a campaign insight: <your insight>. Give me the three\nstrongest objections a sceptical client or CMO would raise against it,\nstated as bluntly as they would in a real meeting. Do not soften them.\n```\n\nA insight that survives blunt objections is worth briefing; one that doesn't needs another pass first.",
    },
    video: {
      title: "Rebuilding a tired campaign brief in one afternoon",
      summary: "Taking a shelved brief, finding the missing human insight, and reworking it with AI-assisted production.",
      bodyMd:
        "**0:00** Why this brief got shelved the first time — a fine idea, no real insight.\n**1:00** Finding the sharper human tension underneath the original angle.\n**2:15** Using AI tools for headline and layout variants once the insight was solid.\n**3:30** Where the team still hand-wrote every line of final copy.\n**4:35** The brief, before and after, side by side.",
      durationS: 297,
    },
  },
  {
    date: "2026-08-15",
    vertical: "general",
    headline: "The productivity gain isn't the prompt — it's what you check afterwards",
    news: {
      title: "Productivity Commission working paper links AI gains to verification habits, not tool choice",
      summary:
        "A new working paper finds measured productivity gains from workplace AI use correlate more with staff verification habits than with which tool is used.",
      bodyMd:
        "A Productivity Commission working paper examining AI adoption across a sample of Australian professional-services firms finds that measured productivity gains correlate more strongly with staff verification habits — spot-checking outputs against source material before using them — than with which AI tool a firm has licensed.\n\nFirms that built a short verification step into standard workflow reported fewer costly corrections downstream, even though the up-front time saving looked smaller on paper. The paper's authors suggest the finding cuts against a common assumption: that the main lever for AI adoption is tool selection, when in practice it's a five-minute habit.",
      sourceId: "src-afr",
      sourceUrl: "https://www.afr.com/technology/productivity-commission-ai-verification-2026",
      sourceTier: 1,
    },
    technique: {
      title: "The one verification prompt worth running before you send anything",
      summary: "A short self-check prompt that flags unverifiable claims in an AI draft before it goes out.",
      bodyMd:
        "Most people verify an AI draft by reading it once and trusting their gut. This prompt makes the check explicit instead.\n\n**Steps**\n\n1. After drafting something with AI help, paste it back in with the source material (if any).\n2. Ask it to flag any claim, number or quote it cannot trace to the source.\n3. Check every flagged item by hand — this step doesn't get automated.\n4. Only then send, publish, or file it.\n\n```\nHere is a draft and, separately, the source material it should be\nbased on. List every claim, number, or quote in the draft that is NOT\ndirectly supported by the source material. Be strict — if you're not\nsure it's supported, flag it.\n\nDraft:\n<paste draft>\n\nSource:\n<paste source>\n```\n\nThis takes about ninety seconds and catches most of the errors that would otherwise surface after you've already sent it.",
    },
    video: {
      title: "A five-minute verification habit that catches most AI mistakes",
      summary: "Building the check from today's technique into a routine you actually keep doing.",
      bodyMd:
        "**0:00** Why the check gets skipped under deadline pressure — and the workaround that fixes that.\n**0:50** Running the verification prompt on a real draft, live.\n**2:05** What a flagged claim looks like, and what to do when you find one.\n**3:15** Turning this into a two-click habit inside your usual writing tool.\n**4:20** What this habit won't catch — and why judgement still matters most.",
      durationS: 288,
    },
  },
];

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function buildEdition(seed: EditionSeed): Edition {
  const editionId = `ed-${seed.date}`;
  const publishedAt = iso(seed.date);
  const createdAt = publishedAt;
  const reviewerId = "usr-reviewer-vala";

  const news: ContentItem = {
    id: `ci-${seed.date}-news`,
    editionId,
    kind: "news",
    title: seed.news.title,
    slug: slugify(seed.news.title),
    bodyMd: seed.news.bodyMd,
    summary: seed.news.summary,
    vertical: seed.vertical,
    sourceUrl: seed.news.sourceUrl,
    sourceId: seed.news.sourceId,
    sourceTier: seed.news.sourceTier,
    status: "published",
    isPremium: false,
    authorKind: "agent",
    approvedBy: reviewerId,
    approvedAt: publishedAt,
    publishedAt,
    createdAt,
    updatedAt: publishedAt,
  };

  const technique: ContentItem = {
    id: `ci-${seed.date}-technique`,
    editionId,
    kind: "technique",
    title: seed.technique.title,
    slug: slugify(seed.technique.title),
    bodyMd: seed.technique.bodyMd,
    summary: seed.technique.summary,
    vertical: seed.vertical,
    status: "published",
    isPremium: false,
    authorKind: "agent",
    approvedBy: reviewerId,
    approvedAt: publishedAt,
    publishedAt,
    createdAt,
    updatedAt: publishedAt,
  };

  const video: ContentItem = {
    id: `ci-${seed.date}-video`,
    editionId,
    kind: "video",
    title: seed.video.title,
    slug: slugify(seed.video.title),
    bodyMd: seed.video.bodyMd,
    summary: seed.video.summary,
    vertical: seed.vertical,
    videoDurationS: seed.video.durationS,
    videoCaptionsUrl: `/captions/${seed.date}-video.vtt`,
    status: "published",
    isPremium: false,
    authorKind: "agent",
    approvedBy: reviewerId,
    approvedAt: publishedAt,
    publishedAt,
    createdAt,
    updatedAt: publishedAt,
  };

  return {
    id: editionId,
    editionDate: seed.date,
    headline: seed.headline,
    status: "published",
    publishedAt,
    items: [news, technique, video],
  };
}

/** All 10 published editions, oldest first. */
export const editions: Edition[] = editionSeeds.map(buildEdition);

/** Most recent edition — what `/` (the daily brief) renders. */
const latestEdition = editions[editions.length - 1];
if (!latestEdition) {
  throw new Error("sample-data: editionSeeds produced zero editions");
}
export const todayEdition: Edition = latestEdition;

// ---------------------------------------------------------------------------
// Prompts (§3.3) — 14 across verticals, 10 free / 4 premium
// ---------------------------------------------------------------------------

export const prompts: Prompt[] = [
  {
    id: "pr-01",
    title: "Meeting summary from a rough transcript",
    body: "Here is a raw meeting transcript. Produce three short sections: decisions made, action items with an owner, and open questions nobody answered. Do not summarise the discussion itself.",
    vertical: "general",
    isPremium: false,
    contentItemId: "ci-2026-08-06-technique",
  },
  {
    id: "pr-02",
    title: "Verification check before you send a draft",
    body: "Here is a draft and the source material it should be based on. List every claim, number, or quote in the draft that is NOT directly supported by the source material.",
    vertical: "general",
    isPremium: false,
    contentItemId: "ci-2026-08-15-technique",
  },
  {
    id: "pr-03",
    title: "Rubric-aligned feedback on a submission",
    body: "Here is a marking rubric with criteria, then a student submission. For each criterion, write feedback that refers specifically to something in the submission. Do not suggest a grade.",
    vertical: "teaching",
    jobRole: "Lecturer",
    isPremium: false,
    contentItemId: "ci-2026-08-07-technique",
  },
  {
    id: "pr-04",
    title: "Differentiate a lesson plan for mixed abilities",
    body: "Here is a lesson plan written for a general class. Rewrite the core activity into three versions: extended, standard, and scaffolded — same learning objective for all three.",
    vertical: "teaching",
    jobRole: "Classroom Teacher",
    isPremium: true,
  },
  {
    id: "pr-05",
    title: "Personalised study plan around real available hours",
    body: "I want to learn <topic> by <date>. I realistically have <N> hours a week in blocks no longer than <M> minutes. Build a week-by-week plan using only that time.",
    vertical: "learning",
    isPremium: false,
    contentItemId: "ci-2026-08-11-technique",
  },
  {
    id: "pr-06",
    title: "Turn a course outline into a five-question quiz",
    body: "Here is a course outline. Write five formative questions tied to specific sections, each with one clearly correct answer and plausible distractors.",
    vertical: "learning",
    isPremium: true,
  },
  {
    id: "pr-07",
    title: "Campaign brief from a one-line idea",
    body: "I have a one-line campaign idea. Before drafting a brief, ask me up to six clarifying questions covering audience, budget tier, channel, timeline and success metric.",
    vertical: "marketing",
    isPremium: false,
    contentItemId: "ci-2026-08-08-technique",
  },
  {
    id: "pr-08",
    title: "Pressure-test a campaign insight",
    body: "Here is a campaign insight. Give me the three strongest objections a sceptical client or CMO would raise against it, stated bluntly. Do not soften them.",
    vertical: "marketing",
    isPremium: false,
    contentItemId: "ci-2026-08-14-technique",
  },
  {
    id: "pr-09",
    title: "Competitor landscape scan starter",
    body: "List the five most likely competitors for <product/service> in <market>, based only on information I provide below — do not invent market share figures or company facts you cannot support.",
    vertical: "marketing",
    isPremium: true,
  },
  {
    id: "pr-10",
    title: "One-on-one agenda from scattered notes",
    body: "Here are my scattered notes about a direct report since our last one-on-one. Suggest three agenda topics ranked by time-sensitivity, each with a one-line reason.",
    vertical: "management",
    isPremium: false,
    contentItemId: "ci-2026-08-09-technique",
  },
  {
    id: "pr-11",
    title: "Weekly report draft from raw project updates",
    body: "Here are this week's raw project updates. Draft a weekly report in three sections: progress, risks, and decisions needed — no more than one page.",
    vertical: "management",
    isPremium: false,
  },
  {
    id: "pr-12",
    title: "Board pack executive summary",
    body: "Here is a full board pack. Draft a one-page executive summary covering only what a director needs to decide on, flagging anything requiring a vote.",
    vertical: "management",
    isPremium: true,
  },
  {
    id: "pr-13",
    title: "Plain-English patient appointment reminder",
    body: "Rewrite this patient appointment reminder in plain English at roughly a Year 8 reading level. Keep all times, locations and preparation instructions exactly as given. Administrative text only, not clinical advice.",
    vertical: "health",
    isPremium: false,
    contentItemId: "ci-2026-08-13-technique",
  },
  {
    id: "pr-14",
    title: "Policy summary in plain English",
    body: "Summarise this policy document in three sections: what's banned, what's approved, and who to ask. Do not answer whether something specific is allowed — flag that as a question for a person.",
    vertical: "general",
    isPremium: false,
    contentItemId: "ci-2026-08-12-technique",
  },
];

// ---------------------------------------------------------------------------
// Organisation, colleagues, current user (§3.2, §4)
// ---------------------------------------------------------------------------

export const organisation: Organisation = {
  id: "org-macquarie",
  name: "Macquarie University",
  slug: "macquarie-university",
  primaryDomain: "mq.edu.au",
  kind: "university",
  memberCount: 47,
  autoCreated: false,
  claimedBy: "usr-admin-macquarie",
};

export const colleagues: Colleague[] = [
  { id: "col-01", displayName: "Priya Natarajan", currentStreak: 34, showInCohort: true },
  { id: "col-02", displayName: "Tom Halloran", currentStreak: 21, showInCohort: true },
  { id: "col-03", displayName: "Grace Efford", currentStreak: 19, showInCohort: true },
  { id: "col-04", displayName: "Marcus Yin", currentStreak: 15, showInCohort: true },
  { id: "col-05", displayName: "Aisha Bakr", currentStreak: 11, showInCohort: true },
  { id: "col-06", displayName: "Ben Okafor", currentStreak: 8, showInCohort: true },
  { id: "col-07", displayName: "Louise Chen", currentStreak: 6, showInCohort: true },
  { id: "col-08", displayName: "Private member", currentStreak: 27, showInCohort: false },
];

export const currentUser: CurrentUser = {
  id: "usr-current",
  displayName: "Sam Whitford",
  email: "sam.whitford@mq.edu.au",
  role: "member",
  tier: "free",
  organisationId: "org-macquarie",
  cohortTrack: "organisation",
  jobRole: "Learning Designer",
  timezone: "Australia/Sydney",
  currentStreak: 12,
  longestStreak: 31,
  preferences: {
    cadence: "daily",
    sendHourLocal: 7,
    verticals: [],
    pushEnabled: true,
  },
};

// ---------------------------------------------------------------------------
// Review queue (§5.5) — 4 in_review items
// ---------------------------------------------------------------------------

export const reviewQueue: ReviewQueueItem[] = [
  {
    id: "ci-review-01",
    editionId: null,
    kind: "news",
    title: "NSW government pilots AI-assisted correspondence drafting across three agencies",
    slug: "nsw-government-ai-correspondence-pilot",
    bodyMd:
      "The NSW Department of Customer Service has confirmed a pilot of AI-assisted correspondence drafting across three agencies, aimed at reducing turnaround time on routine constituent letters. Staff report the tool handles first drafts of template-based replies well but still requires review for anything involving a specific commitment or dollar figure.",
    summary:
      "A three-agency NSW government pilot uses AI to draft routine constituent correspondence, with mandatory human review before anything is sent.",
    vertical: "general",
    sourceUrl: "https://www.itnews.com.au/news/nsw-ai-correspondence-pilot-2026",
    sourceId: "src-itnews",
    sourceTier: 1,
    status: "in_review",
    isPremium: false,
    authorKind: "agent",
    createdAt: "2026-08-15T02:10:00Z",
    updatedAt: "2026-08-15T02:10:00Z",
    requiresSecondApproval: false,
    tierTwoVerificationRequired: false,
    submittedAt: "2026-08-15T02:10:00Z",
  },
  {
    id: "ci-review-02",
    editionId: null,
    kind: "news",
    title: "Regional law firms report faster contract review turnaround using AI-assisted redlining",
    slug: "regional-law-firms-ai-redlining",
    bodyMd:
      "Several regional New South Wales law firms report materially faster first-pass contract review using AI-assisted redlining tools, though partners interviewed stressed the tool flags issues for a lawyer to assess rather than making any judgement call itself.",
    summary:
      "Regional law firms report faster first-pass contract review from AI redlining tools, with lawyers still making every substantive call.",
    vertical: "general",
    sourceUrl: "https://www.smartcompany.com.au/legal/regional-firms-ai-redlining-2026",
    sourceId: "src-smartcompany",
    sourceTier: 2,
    status: "in_review",
    isPremium: false,
    authorKind: "agent",
    createdAt: "2026-08-15T02:25:00Z",
    updatedAt: "2026-08-15T02:25:00Z",
    requiresSecondApproval: false,
    tierTwoVerificationRequired: true,
    submittedAt: "2026-08-15T02:25:00Z",
  },
  {
    id: "ci-review-03",
    editionId: null,
    kind: "technique",
    title: "Draft a discharge-summary cover note without touching clinical content",
    slug: "discharge-summary-cover-note-technique",
    bodyMd:
      "An administrative prompt for rewriting the plain-English cover note that accompanies a discharge summary — scoped deliberately away from any clinical content, dosage, or diagnosis, which must remain entirely clinician-authored.",
    summary:
      "An admin-only prompt for the plain-English cover note sent with a discharge summary — no clinical content included.",
    vertical: "health",
    status: "in_review",
    isPremium: false,
    authorKind: "agent",
    createdAt: "2026-08-15T03:05:00Z",
    updatedAt: "2026-08-15T03:05:00Z",
    requiresSecondApproval: true,
    tierTwoVerificationRequired: false,
    submittedAt: "2026-08-15T03:05:00Z",
  },
  {
    id: "ci-review-04",
    editionId: null,
    kind: "technique",
    title: "Turn quarterly OKR check-ins into a one-page update",
    slug: "quarterly-okr-check-in-technique",
    bodyMd:
      "Here are this quarter's OKR check-in notes across a team. Draft a one-page update grouped by objective, flagging any key result that is off track with a one-line reason. Do not editorialise on individual performance.",
    summary: "A prompt that turns scattered OKR check-in notes into a one-page, objective-grouped update.",
    vertical: "management",
    status: "in_review",
    isPremium: false,
    authorKind: "agent",
    createdAt: "2026-08-15T03:40:00Z",
    updatedAt: "2026-08-15T03:40:00Z",
    requiresSecondApproval: false,
    tierTwoVerificationRequired: false,
    submittedAt: "2026-08-15T03:40:00Z",
  },
];

// ---------------------------------------------------------------------------
// Admin metrics (§3.7) — 30-day series, deterministic (no Math.random, so
// fixtures and any snapshot-style test stay stable across runs).
// ---------------------------------------------------------------------------

function seededSeries(base: number, amplitude: number, seed: number, days = 30): MetricPoint[] {
  const points: MetricPoint[] = [];
  const end = new Date("2026-08-15T00:00:00Z");
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(end);
    date.setUTCDate(date.getUTCDate() - i);
    // Deterministic pseudo-noise: a couple of out-of-phase sine waves, no RNG.
    const wave =
      Math.sin((i + seed) * 0.45) * 0.5 + Math.sin((i + seed) * 0.12) * 0.5;
    const value = Math.max(0, Math.round(base + amplitude * wave));
    points.push({ date: date.toISOString().slice(0, 10), value });
  }
  return points;
}

export const adminMetrics: AdminMetrics = {
  signupsPerDay: seededSeries(14, 9, 1),
  opensPerDay: seededSeries(220, 60, 7),
  completionsPerDay: seededSeries(150, 45, 13),
  reviewTimeMinutesPerDay: seededSeries(4, 2, 21),
};
