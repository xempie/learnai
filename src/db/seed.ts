/**
 * Seeds a working dataset: categories, an admin user, an anchor organisation,
 * and the starter topic catalogue with episodes.
 *
 *   pnpm db:seed
 *
 * Idempotent - safe to re-run. Existing rows are left alone.
 */

import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "./index";
import {
  authCredentials,
  categories,
  topicAttachments,
  topicCategories,
  topicHashtags,
  topics,
  hashtags,
  episodes,
  notificationPreferences,
  orgJoinCodes,
  organizationDomains,
  organizations,
  userCategories,
  userStreaks,
  users,
} from "./schema";
import { hashPassword } from "../lib/auth/password";

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@data-corner.com.au";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe12345!";
const LEARNER_PASSWORD = process.env.SEED_LEARNER_PASSWORD ?? "TestPassword123";

/**
 * Locally, printing the seeded passwords is the whole point - it saves a trip
 * to the README. In a deployed environment stdout is shipped to CloudWatch,
 * where it becomes a durable, searchable copy of a live admin credential that
 * survives every later password change. So: print only when the password is
 * the throwaway default that is already published in the README.
 */
const SHOW_PASSWORDS =
  ADMIN_PASSWORD === "ChangeMe12345!" && LEARNER_PASSWORD === "TestPassword123";

function secret(value: string): string {
  return SHOW_PASSWORDS ? value : "(set from SEED_* secret - not logged)";
}

const CATEGORIES = [
  { slug: "ai-basics", name: "AI Basics", description: "What AI is, how it works, and the words everyone else is using.", colorHex: "#202020" },
  { slug: "ai-at-work", name: "AI at Work", description: "Everyday tools and workflows that save real hours.", colorHex: "#816729" },
  { slug: "privacy-security", name: "Privacy & Security", description: "What not to paste, where your data goes, and how to stay compliant.", colorHex: "#c2410c" },
  { slug: "responsible-ai", name: "Responsible AI", description: "Bias, fairness, transparency and the policies behind them.", colorHex: "#4d4d4d" },
  { slug: "leadership", name: "Leadership & Management", description: "Leading teams through AI change and evaluating vendor claims.", colorHex: "#828282" },
  { slug: "tools-reviews", name: "Tools & Reviews", description: "Hands-on walkthroughs of the tools worth your time.", colorHex: "#ff682c" },
  { slug: "ai-news", name: "AI News", description: "What changed this week and whether it matters to you.", colorHex: "#202020" },
  { slug: "regulation", name: "Regulation & Compliance", description: "The EU AI Act, Australian frameworks, and what they require.", colorHex: "#816729" },
  { slug: "careers", name: "Careers & Skills", description: "Staying employable and provably capable in an AI workplace.", colorHex: "#4d4d4d" },
  { slug: "research", name: "Research & Study", description: "AI for literature review, note-taking and academic work.", colorHex: "#c2410c" },
];

/**
 * Seeded resources are prompts and links only.
 *
 * File resources are deliberately absent: a row pointing at an s3Key that was
 * never uploaded would give the learner a download button that 404s. Files go in
 * through /admin, which presigns the upload first.
 */
type SeedResource =
  | {
      kind: "prompt";
      title: string;
      description: string;
      body: string;
      isPreview?: boolean;
    }
  | {
      kind: "link";
      title: string;
      description: string;
      url: string;
      isPreview?: boolean;
    };

interface SeedTopic {
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  /** Markdown. Why this is worth a working professional's time. */
  whyLearn: string;
  /** Markdown bullet list. What they will be able to do afterwards. */
  outcomes: string;
  /** Length of the "why take this topic" intro video. */
  introDurationSec: number;
  categories: string[];
  tags: string[];
  isFree?: boolean;
  freeOrder?: number;
  affiliateTool?: string;
  affiliateUrl?: string;
  publishedDaysAgo: number;
  viewCount: number;
  impressionCount: number;
  episodes: { title: string; durationSec: number; isPreview?: boolean }[];
  resources: SeedResource[];
}

/**
 * Placeholder intro keys so the intro endpoint and the topic page have
 * something to render against. There is no file behind them yet: upload the
 * real intro through /admin, which replaces the key with a presigned one.
 */
function introVideoKey(slug: string): string {
  return `video/seed/${slug}-intro.mp4`;
}

const TOPICS: SeedTopic[] = [
  {
    slug: "you-used-ai-today",
    title: "You Used AI Today Without Realising It",
    excerpt: "You've probably used AI three times before lunch. Here's what it actually is.",
    body: "Forget the sci-fi. This topic gives you one clear mental model for what today's AI actually is - pattern-matching at enormous scale - and why that difference decides whether it helps you or embarrasses you.",
    whyLearn:
      "Most people at work now use AI daily but cannot say what it is doing, which makes it hard to tell a good answer from a merely plausible one. This topic gives you a single mental model that holds up across every tool your organisation is rolling out. Twenty minutes here saves you from the two mistakes that make beginners look careless.",
    outcomes: [
      "- Explain in one sentence what a language model is actually doing when it answers you",
      "- Tell narrow AI and generative AI apart when a vendor blurs the line",
      "- Name the AI systems already running in your ordinary working day",
      "- Judge which of your tasks suit AI and which do not",
    ].join("\n"),
    introDurationSec: 74,
    categories: ["ai-basics"],
    tags: ["ai101", "genai"],
    isFree: true,
    freeOrder: 1,
    publishedDaysAgo: 19,
    viewCount: 1284,
    impressionCount: 3120,
    episodes: [
      { title: "What people mean when they say AI", durationSec: 290, isPreview: true },
      { title: "Narrow AI vs generative AI", durationSec: 275 },
      { title: "Where you already meet it every day", durationSec: 260 },
      { title: "The one mental model worth keeping", durationSec: 310 },
      { title: "What to do differently tomorrow", durationSec: 240 },
    ],
    resources: [
      {
        kind: "prompt",
        title: "Plain-English explainer",
        description: "Turns any piece of AI jargon into something you can repeat in a meeting.",
        isPreview: true,
        body: "You are explaining technology to a smart colleague who is not technical. Explain [TOPIC] in under 200 words. Use one everyday analogy, avoid jargon entirely, and finish with the single most common misconception people have about it. If the topic has a real limitation I should know before relying on it, state that plainly at the end.",
      },
      {
        kind: "link",
        title: "Australia's AI Ethics Principles",
        description: "The eight principles most Australian AI policies are written against.",
        url: "https://www.industry.gov.au/publications/australias-artificial-intelligence-ethics-framework/australias-ai-ethics-principles",
      },
    ],
  },
  {
    slug: "why-chatgpt-makes-things-up",
    title: "Why ChatGPT Sounds Confident When It's Wrong",
    excerpt: "It isn't lying and it isn't thinking. It's predicting.",
    body: "Understand the one mechanism behind every AI answer and you'll never be fooled by a confident wrong one again.",
    whyLearn:
      "The costly errors are not the obvious ones, they are the fluent, well-formatted answers that happen to be wrong. Once you know why a model produces those, you can tell within seconds which parts of an answer need checking. That skill is what separates people who use AI safely from people who quietly ship its mistakes.",
    outcomes: [
      "- Describe next-word prediction well enough to explain it to your team",
      "- Recognise the answer types where fabrication is most likely",
      "- Run a two-minute verification pass on any AI output before you send it",
      "- Decide when a task needs a source, not a summary",
    ].join("\n"),
    introDurationSec: 68,
    categories: ["ai-basics"],
    tags: ["hallucination", "ai101"],
    isFree: true,
    freeOrder: 2,
    publishedDaysAgo: 16,
    viewCount: 1102,
    impressionCount: 2870,
    episodes: [
      { title: "Next-word prediction, plainly explained", durationSec: 305, isPreview: true },
      { title: "Why fluency is not accuracy", durationSec: 280 },
      { title: "The shapes hallucinations take", durationSec: 295 },
      { title: "Spotting the risky answer types", durationSec: 265 },
    ],
    resources: [
      {
        kind: "prompt",
        title: "Fact-check pass",
        description: "Run this straight after any answer you are thinking of forwarding.",
        isPreview: true,
        body: "Review your previous answer as a sceptical fact-checker would. List every factual claim it contains. Mark each one as verified from widely documented knowledge, uncertain, or likely fabricated. For anything you cannot verify, say so explicitly and name the source I would need to check it against. Do not rewrite the answer and do not add new claims.",
      },
      {
        kind: "prompt",
        title: "Cite or admit prompt",
        description: "Stops a model filling gaps with invented references.",
        body: "Answer the question below. For every factual claim, give the source you are drawing on. Where you do not have a source you are confident about, write 'no reliable source' instead of naming one. I would rather have four sourced claims than ten unsourced ones. Question: [PASTE QUESTION]",
      },
      {
        kind: "link",
        title: "OpenAI prompt engineering guide",
        description: "The vendor's own guidance on getting more reliable output.",
        url: "https://platform.openai.com/docs/guides/prompt-engineering",
      },
    ],
  },
  {
    slug: "what-not-to-paste-into-ai",
    title: "What NOT to Paste Into AI - One Mistake Can Cost More Than a Year of Training",
    excerpt: "The three questions to ask before you paste anything sensitive.",
    body: "Client data, contracts, patient records, source code. Where your prompts actually go, what gets kept, and how to stay on the right side of your obligations.",
    whyLearn:
      "The average staff member has no idea whether the free chatbot tab keeps what they paste, and most organisations found out only after something sensitive left the building. This topic covers what actually happens to a prompt, which categories of information must never go near a consumer tier, and what to do in the first hour if it already has. It is the one topic to run before you approve any AI tool for your team.",
    outcomes: [
      "- Say where a prompt goes and how long it is kept on the tiers your team uses",
      "- Apply a three-question test before pasting anything into an AI tool",
      "- Redact a document properly instead of trusting a model to ignore the details",
      "- Run the first hour of an accidental disclosure without making it worse",
    ].join("\n"),
    introDurationSec: 96,
    categories: ["privacy-security", "regulation"],
    tags: ["privacy", "compliance", "security"],
    publishedDaysAgo: 2,
    viewCount: 1673,
    impressionCount: 2640,
    episodes: [
      { title: "Where your prompt actually goes", durationSec: 295, isPreview: true },
      { title: "Retention, training data and enterprise tiers", durationSec: 310 },
      { title: "The categories that must never leave", durationSec: 280 },
      { title: "Three questions before you paste", durationSec: 265 },
      { title: "If it already happened: what to do", durationSec: 240 },
      { title: "Writing a policy people actually follow", durationSec: 300 },
    ],
    resources: [
      {
        kind: "prompt",
        title: "Redaction pass before you paste",
        description: "Strips identifiers out of a document and tells you what it removed.",
        body: "Rewrite the text below so it can be shared with an external AI tool. Replace every person's name with [NAME], organisation with [ORG], email address with [EMAIL], phone number with [PHONE], street address with [ADDRESS], and any account, invoice, patient or matter number with [REF]. Keep the structure, dates and meaning intact. Then list every replacement you made so I can check nothing identifying survived. Text: [PASTE HERE]",
      },
      {
        kind: "prompt",
        title: "AI use policy first draft",
        description: "A starting point your team will actually read, not a twelve-page annex.",
        body: "Draft a one-page AI use policy for a [SIZE] organisation in [SECTOR]. Cover: which tools are approved, what must never be pasted into any AI tool, when output must be checked by a person before it goes to a customer, and who to tell if something sensitive is disclosed by accident. Write it in plain language at no more than 400 words, as rules rather than principles, and mark anything that needs a decision from us as [DECIDE].",
      },
      {
        kind: "link",
        title: "OAIC guidance on commercially available AI products",
        description: "The Australian privacy regulator's position, in its own words.",
        isPreview: true,
        url: "https://www.oaic.gov.au/privacy/privacy-guidance-for-organisations-and-government-agencies/guidance-on-privacy-and-the-use-of-commercially-available-ai-products",
      },
    ],
  },
  {
    slug: "emails-that-sound-like-you",
    title: "Stop Sending Emails That Sound Like a Robot Wrote Them",
    excerpt: "Everyone can spot AI-written email now. Here's how to stop.",
    body: "Teach it your voice with one reusable prompt and halve your inbox time without sounding like a template.",
    whyLearn:
      "Colleagues and clients can now spot a machine-written email in one line, and it costs you credibility every time. The fix is not writing longer prompts, it is giving the model your own writing as the reference. This topic shows you how to build that reference once and reuse it every day.",
    outcomes: [
      "- Build a reusable voice profile from emails you have already sent",
      "- Cut the four tells that make AI email obvious to a reader",
      "- Draft a reply in under a minute that still sounds like you wrote it",
      "- Run a final read-through that catches the things a model gets wrong about tone",
    ].join("\n"),
    introDurationSec: 62,
    categories: ["ai-at-work"],
    tags: ["email", "writing", "productivity"],
    affiliateTool: "Notion AI",
    affiliateUrl: "https://example.com/affiliate/notion-ai",
    publishedDaysAgo: 9,
    viewCount: 934,
    impressionCount: 2210,
    episodes: [
      { title: "Why AI email is so easy to spot", durationSec: 300, isPreview: true },
      { title: "Teaching it your tone with examples", durationSec: 285 },
      { title: "A reusable prompt you can save", durationSec: 270 },
      { title: "The final read-through that matters", durationSec: 255 },
    ],
    resources: [
      {
        kind: "prompt",
        title: "Teach it your voice",
        description: "Paste three of your own emails once, then reuse the profile it builds.",
        body: "Here are three emails I have written: [PASTE THREE EMAILS]. First, describe my writing voice as five specific rules covering sentence length, how I open and sign off, how direct I am, words I reach for and words I never use. Then draft a reply to the email below following those rules exactly. Keep it under 150 words, do not add pleasantries I would not use, and do not use any word that does not appear in my style. Email to answer: [PASTE EMAIL]",
      },
      {
        kind: "link",
        title: "Microsoft Copilot help centre",
        description: "Reference for the assistant most workplaces already have a licence for.",
        url: "https://support.microsoft.com/en-us/copilot",
      },
    ],
  },
  {
    slug: "never-take-meeting-notes-again",
    title: "Never Take Meeting Notes Again (And Never Miss an Action Item)",
    excerpt: "The full pipeline, plus the checks that keep the record accurate.",
    body: "Record, transcribe, summarise, extract the actions - plus the two checks that stop a wrong decision entering the official record.",
    whyLearn:
      "Automated notes are only useful if the record they produce can be relied on, and most teams skip the checks that make that true. This topic covers the whole pipeline from recording to a shared summary, including consent, the two accuracy checks worth doing, and what not to circulate. You get your attention back in meetings without putting a wrong decision into the official record.",
    outcomes: [
      "- Choose a transcription tool that fits your organisation's data rules",
      "- Turn a raw transcript into decisions, owners and dates you can act on",
      "- Catch the two failure modes that put a wrong decision in the minutes",
      "- Share notes without circulating something that was said in confidence",
    ].join("\n"),
    introDurationSec: 81,
    categories: ["ai-at-work", "tools-reviews"],
    tags: ["meetings", "productivity"],
    publishedDaysAgo: 12,
    viewCount: 776,
    impressionCount: 2410,
    episodes: [
      { title: "Choosing a transcription tool", durationSec: 345, isPreview: true },
      { title: "From transcript to summary", durationSec: 300 },
      { title: "Extracting action items reliably", durationSec: 290 },
      { title: "The two accuracy checks", durationSec: 275 },
      { title: "Sharing notes without oversharing", durationSec: 260 },
    ],
    resources: [
      {
        kind: "prompt",
        title: "Transcript to decisions and actions",
        description: "Refuses to invent an owner or a due date that was never said.",
        body: "You are turning a meeting transcript into a record. Return three sections. Decisions: what was agreed and who agreed it, with the transcript line quoted for each. Actions: owner, task and due date, taken only from what was actually said. Open questions: anything raised and left unresolved. Where an owner or date was never stated, write 'not stated' rather than guessing, and never merge two speakers into one. Transcript: [PASTE TRANSCRIPT]",
      },
      {
        kind: "link",
        title: "Google Meet transcripts",
        description: "How to turn on transcripts in a tool most teams already have.",
        url: "https://support.google.com/meet/answer/10937040",
      },
    ],
  },
  {
    slug: "when-ai-picks-favourites",
    title: "When AI Picks Favourites: Spotting Bias Before It Reaches a Decision",
    excerpt: "Bias arrives as a confident recommendation. Here's how to see it.",
    body: "Hiring, lending, triage, promotion. How bias enters an AI system and what to check before you act on its output.",
    whyLearn:
      "Bias does not arrive labelled, it arrives as a confident recommendation about a person. If you shortlist, rank, price or triage with AI in the loop, you are accountable for that output whether or not you built the system. This topic gives you the questions to ask before a recommendation becomes a decision.",
    outcomes: [
      "- Trace the three points where bias enters a system you did not build",
      "- Interrogate a vendor about their training data and get a usable answer",
      "- Run a fairness check on a shortlist or ranking before you act on it",
      "- Document why you accepted or overrode a recommendation",
    ].join("\n"),
    introDurationSec: 88,
    categories: ["responsible-ai"],
    tags: ["bias", "fairness", "responsibleai"],
    publishedDaysAgo: 23,
    viewCount: 689,
    impressionCount: 2890,
    episodes: [
      { title: "How bias gets into the training data", durationSec: 310, isPreview: true },
      { title: "Where it shows up in real decisions", durationSec: 295 },
      { title: "Questions to ask before you act", durationSec: 280 },
    ],
    resources: [
      {
        kind: "prompt",
        title: "Fairness interrogation before you act",
        description: "Eight questions a fairness reviewer would ask, one at a time.",
        body: "I am about to act on an AI-generated recommendation about people, in the context of [HIRING, RANKING, PRICING, TRIAGE OR LENDING]. Act as a fairness reviewer. Ask me eight questions covering the data the system learned from, which groups it could disadvantage, what it optimises for, who checked it last and what evidence would change the recommendation. Ask one question at a time and wait for my answer. At the end, summarise the risks I could not answer and tell me which one to resolve first.",
      },
      {
        kind: "link",
        title: "NIST AI Risk Management Framework",
        description: "The framework most vendor assurance questionnaires are derived from.",
        url: "https://www.nist.gov/itl/ai-risk-management-framework",
      },
    ],
  },
  {
    slug: "spreadsheets-in-half-the-time",
    title: "The Spreadsheet Tricks That Turn a Whole Afternoon Into Ten Minutes",
    excerpt: "Formulas you don't write, data that cleans itself.",
    body: "Formula generation, data cleaning and instant charts, inside the spreadsheet you already have open.",
    whyLearn:
      "Spreadsheet work is where most professionals lose whole afternoons, and it is the task AI is genuinely good at because the answer can be checked immediately. This topic covers formula generation, cleaning messy exports and building a chart from a description, in the spreadsheet you already have open. It also covers the check that stops a wrong formula propagating through a report.",
    outcomes: [
      "- Describe a calculation in plain words and get a working formula back",
      "- Clean an inconsistent export without hand-editing hundreds of rows",
      "- Build a chart from a sentence instead of a menu",
      "- Verify an AI-written formula against a handful of rows before trusting it",
    ].join("\n"),
    introDurationSec: 70,
    categories: ["ai-at-work", "tools-reviews"],
    tags: ["excel", "productivity", "data"],
    publishedDaysAgo: 26,
    viewCount: 1340,
    impressionCount: 2110,
    episodes: [
      { title: "Formulas without the syntax", durationSec: 320, isPreview: true },
      { title: "Cleaning messy data fast", durationSec: 300 },
      { title: "Charts that build themselves", durationSec: 285 },
      { title: "Checking the output before you trust it", durationSec: 270 },
    ],
    resources: [
      {
        kind: "prompt",
        title: "Formula from a plain description",
        description: "Gets the formula and, more usefully, how it behaves on bad data.",
        body: "I am using [EXCEL OR GOOGLE SHEETS]. My data sits in [DESCRIBE THE COLUMNS AND ROUGH ROW COUNT]. I need to [DESCRIBE THE RESULT IN PLAIN WORDS]. Give me the formula, explain each part in one line, and tell me what it returns when a cell is blank, holds text instead of a number, or contains a date stored as text. If there is a simpler approach than a formula, say so first.",
      },
      {
        kind: "link",
        title: "Excel functions reference",
        description: "For checking what a generated formula actually does.",
        url: "https://support.microsoft.com/en-us/office/excel-functions-alphabetical-b3944572-255d-4efb-bb96-c6d90033e188",
      },
    ],
  },
  {
    slug: "ai-for-managers",
    title: "Your Team Already Uses AI. Do You Understand It Better Than They Do?",
    excerpt: "Four judgement calls every leader now has to make.",
    body: "The manager who can't evaluate AI-assisted work is managing blind. Four decisions every leader faces, and how to make them.",
    whyLearn:
      "Your team is already using AI, with or without a policy, and the gap that matters is your ability to judge the work that comes back. This topic covers the four calls a manager now has to make: what to delegate to a model, how to review AI-assisted work, how to read a vendor's claims, and what to say to the team about all of it. It ends with a rollout plan you can run in thirty days.",
    outcomes: [
      "- Review AI-assisted work without either rubber-stamping it or rewriting it",
      "- Decide which tasks go to a model and which stay with a person",
      "- Test a vendor claim against evidence rather than a demo",
      "- Set expectations with your team so nobody hides how the work got done",
    ].join("\n"),
    introDurationSec: 92,
    categories: ["leadership"],
    tags: ["leadership", "management"],
    publishedDaysAgo: 1,
    viewCount: 96,
    impressionCount: 240,
    episodes: [
      { title: "What your team is already doing", durationSec: 330, isPreview: true },
      { title: "Judging AI-assisted work", durationSec: 305 },
      { title: "Delegating to AI vs to people", durationSec: 295 },
      { title: "Evaluating vendor claims", durationSec: 280 },
      { title: "Setting expectations openly", durationSec: 265 },
      { title: "A 30-day rollout plan", durationSec: 310 },
    ],
    resources: [
      {
        kind: "prompt",
        title: "Review checklist for AI-assisted work",
        description: "Produces something you can paste straight into a team wiki.",
        body: "I manage a team that uses AI to draft work in [DISCIPLINE]. Write a ten-item checklist for reviewing an AI-assisted deliverable. Cover what to verify independently, what to ask the person who submitted it, and the signals that suggest nobody checked the output. One sentence per item, written as an instruction to the reviewer, no preamble. Then add three questions I should ask if two items fail.",
      },
      {
        kind: "prompt",
        title: "Vendor claim stress test",
        description: "Turns a sales deck into questions the vendor has to answer with evidence.",
        body: "Here is what an AI vendor is claiming: [PASTE THE CLAIM OR FEATURE LIST]. Give me the twelve questions I should ask before signing, covering what the system was trained and evaluated on, how errors surface, where our data goes, what happens on renewal, and what evidence would prove the headline number. Mark the three questions where a vague answer should end the conversation.",
      },
      {
        kind: "link",
        title: "OECD AI Principles",
        description: "The international baseline most national AI policies build on.",
        url: "https://www.oecd.org/en/topics/sub-issues/ai-principles.html",
      },
    ],
  },
  {
    slug: "the-rules-are-already-here",
    title: "The AI Rules Are Already Here - And Nobody Told Your Team",
    excerpt: "What the EU AI Act and Australia's framework actually require of you.",
    body: "The obligations most organisations miss are the ones that apply to users of AI systems, not builders.",
    whyLearn:
      "Most compliance reading is written for the people who build AI systems, which is why the obligations that apply to everyone else get missed. If your organisation buys or deploys AI, some duties already apply to you, including telling people when they are dealing with a machine and keeping evidence of human oversight. This topic covers what a deployer owes and what to start recording now.",
    outcomes: [
      "- Work out whether you are a provider or a deployer for a given use case",
      "- List the obligations that already apply to your organisation today",
      "- Keep an evidence trail that would survive a regulator asking for it",
      "- Brief your leadership on exposure without overstating the risk",
    ].join("\n"),
    introDurationSec: 84,
    categories: ["regulation", "responsible-ai"],
    tags: ["euaiact", "regulation", "compliance"],
    isFree: true,
    freeOrder: 3,
    publishedDaysAgo: 6,
    viewCount: 508,
    impressionCount: 1760,
    episodes: [
      { title: "Who the rules actually apply to", durationSec: 285, isPreview: true },
      { title: "What deployers owe", durationSec: 300 },
      { title: "Keeping the evidence trail", durationSec: 275 },
    ],
    resources: [
      {
        kind: "prompt",
        title: "Obligations triage for a use case",
        description: "Orientation before you pay for legal advice, not a substitute for it.",
        isPreview: true,
        body: "We are a [SIZE] organisation in [SECTOR] planning to use AI to [DESCRIBE THE USE CASE], with users in [JURISDICTIONS]. Walk me through the questions that decide whether we are a provider or a deployer under the EU AI Act, and which risk tier this use case most likely sits in. Flag every point where your answer depends on a fact I have not given you. Finish with the records we should start keeping now. Treat this as orientation, not legal advice.",
      },
      {
        kind: "link",
        title: "EU AI Act explorer",
        description: "The text itself, searchable by article and by obligation.",
        url: "https://artificialintelligenceact.eu/ai-act-explorer/",
      },
    ],
  },
  {
    slug: "prompting-that-actually-works",
    title: "Prompting That Actually Works: A Complete Practical Topic",
    excerpt: "Twenty short episodes that turn vague requests into reliable output.",
    body: "The longest topic in the catalogue, and the one that changes day-to-day work the most. Each episode is a single technique you can use in the next thing you write.",
    whyLearn:
      "Most people never get past typing a question and hoping. The gap between a mediocre answer and a genuinely useful one is almost always the prompt, not the model. This topic works through twenty techniques in order, each short enough to try immediately.",
    outcomes: "- Write prompts that produce usable output on the first attempt\n- Supply context and constraints without burying the request\n- Extract structured data you can paste straight into a spreadsheet\n- Build a reusable prompt library your whole team can share",
    introDurationSec: 96,
    categories: ["ai-at-work", "ai-basics"],
    tags: ["prompting", "productivity", "ai101"],
    publishedDaysAgo: 4,
    viewCount: 2140,
    impressionCount: 4380,
    episodes: [
      { title: "Why prompt quality decides everything", durationSec: 250, isPreview: true },
      { title: "The four-part prompt structure", durationSec: 290 },
      { title: "Giving the model a role that helps", durationSec: 265 },
      { title: "Supplying context without overloading", durationSec: 275 },
      { title: "Asking for a format you can actually use", durationSec: 240 },
      { title: "Few-shot: teaching by example", durationSec: 300 },
      { title: "Constraints that stop waffle", durationSec: 255 },
      { title: "Getting the model to show its reasoning", durationSec: 285 },
      { title: "Asking it to critique its own answer", durationSec: 270 },
      { title: "Chaining prompts for longer jobs", durationSec: 310 },
      { title: "Prompting over a document you supply", durationSec: 295 },
      { title: "Extracting structured data reliably", durationSec: 305 },
      { title: "Rewriting in your own voice", durationSec: 260 },
      { title: "Prompts for meetings and summaries", durationSec: 245 },
      { title: "Prompts for analysis and comparison", durationSec: 280 },
      { title: "Catching the confident wrong answer", durationSec: 265 },
      { title: "Building a personal prompt library", durationSec: 235 },
      { title: "Sharing prompts safely across a team", durationSec: 250 },
      { title: "What to do when it keeps missing", durationSec: 275 },
      { title: "Putting it together: a working session", durationSec: 320 }
    ],
    resources: [
      {
        kind: "prompt",
        title: "The four-part starter template",
        description: "Role, context, task, format. Fill the brackets and delete the rest.",
        isPreview: true,
        body: "You are a [ROLE] with experience in [DOMAIN].\n\nContext: [WHAT YOU NEED TO KNOW ABOUT MY SITUATION]\n\nTask: [THE ONE THING I WANT]\n\nFormat: [BULLETS / TABLE / SHORT PARAGRAPHS], no more than [LENGTH]. If anything is ambiguous, ask before answering.",
      },
      {
        kind: "prompt",
        title: "Self-critique pass",
        description: "Run this on any answer you plan to act on.",
        body: "Review your previous answer. List every factual claim you made and mark each one as verified, uncertain, or inferred. For anything uncertain or inferred, tell me what I would need to check. Then give me a corrected version.",
      },
      {
        kind: "link",
        title: "Prompt patterns reference",
        description: "A catalogue of named patterns, useful once the basics land.",
        url: "https://www.promptingguide.ai/",
      },
    ],
  },
  {
    slug: "the-one-habit-that-catches-ai-mistakes",
    title: "The One Habit That Catches AI Mistakes",
    excerpt: "A single 5-minute video. One habit, used before you act on any AI answer.",
    body: "Some topics need one video, not six. This is one of them.",
    whyLearn:
      "One fabricated statistic in a report you signed is all it takes. This is the 30-second check that protects the reputation you spent years building, and it fits in a single sitting.",
    outcomes: "- Run a 30-second check on any AI answer before acting on it\n- Recognise which answer types are most likely to be fabricated\n- Ask for sources in a way that actually surfaces them",
    introDurationSec: 42,
    categories: ["ai-basics", "privacy-security"],
    tags: ["verification", "ai101"],
    isFree: true,
    freeOrder: 4,
    publishedDaysAgo: 3,
    viewCount: 812,
    impressionCount: 1990,
    episodes: [
      { title: "The 30-second verification habit", durationSec: 288, isPreview: true },
    ],
    resources: [
      {
        kind: "prompt",
        title: "Verify before you act",
        description: "Paste this after any answer you plan to rely on.",
        isPreview: true,
        body: "List every factual claim in your last answer. Mark each one verified, uncertain, or inferred. For anything not verified, tell me exactly what I should check and where. Then give me a corrected version with the uncertain parts removed.",
      },
    ],
  },
];

/**
 * Adds a topic's prompts and links, skipping any that are already there.
 * Matched on title, so a re-run never duplicates a resource and never
 * overwrites one an admin has since edited.
 */
async function seedResources(topicId: string, resources: SeedResource[]): Promise<number> {
  let added = 0;
  for (const [i, r] of resources.entries()) {
    const existing = await db.query.topicAttachments.findFirst({
      where: and(
        eq(topicAttachments.topicId, topicId),
        eq(topicAttachments.title, r.title),
      ),
      columns: { id: true },
    });
    if (existing) continue;

    await db.insert(topicAttachments).values({
      topicId,
      kind: r.kind,
      title: r.title,
      description: r.description,
      body: r.kind === "prompt" ? r.body : null,
      url: r.kind === "link" ? r.url : null,
      sortOrder: i,
      isPreview: r.isPreview ?? false,
    });
    added += 1;
  }
  return added;
}

async function main() {
  console.log("Seeding Acadu…\n");

  /* ---------- categories ---------- */
  const categoryIds = new Map<string, string>();
  for (const [i, c] of CATEGORIES.entries()) {
    const existing = await db.query.categories.findFirst({
      where: eq(categories.slug, c.slug),
      columns: { id: true },
    });
    if (existing) {
      categoryIds.set(c.slug, existing.id);
      continue;
    }
    const [row] = await db
      .insert(categories)
      .values({ ...c, sortOrder: i + 1, isActive: c.slug !== "research" })
      .returning({ id: categories.id });
    categoryIds.set(c.slug, row!.id);
  }
  console.log(`  categories: ${categoryIds.size}`);

  /* ---------- anchor organisation ---------- */
  let org = await db.query.organizations.findFirst({
    where: eq(organizations.slug, "adelaide-university"),
  });
  if (!org) {
    const [created] = await db
      .insert(organizations)
      .values({
        name: "Adelaide University",
        slug: "adelaide-university",
        type: "university",
        isProvisional: false,
        licenseType: "pilot",
        seatsTotal: 250,
        licenseExpiresAt: new Date(Date.now() + 365 * 24 * 3600 * 1000),
      })
      .returning();
    org = created!;
    await db.insert(organizationDomains).values([
      { orgId: org.id, domain: "adelaide.edu.au", verified: true },
      { orgId: org.id, domain: "student.adelaide.edu.au", verified: true },
    ]);
    await db.insert(orgJoinCodes).values({
      orgId: org.id,
      code: "ADEL-7K2P",
      label: "Pilot cohort",
      maxUses: 250,
    });
  }
  console.log(`  organisation: ${org.name} (join code ADEL-7K2P)`);

  /* ---------- admin user ---------- */
  let admin = await db.query.users.findFirst({ where: eq(users.email, ADMIN_EMAIL) });
  if (!admin) {
    const [created] = await db
      .insert(users)
      .values({
        cognitoSub: `dev_seed_${randomUUID()}`,
        email: ADMIN_EMAIL,
        emailDomain: ADMIN_EMAIL.split("@")[1]!,
        emailVerified: true,
        nickname: "founder",
        ageRange: "35-44",
        role: "platform_admin",
        termsAcceptedAt: new Date(),
        onboardedAt: new Date(),
        trialEndsAt: new Date(Date.now() + 365 * 24 * 3600 * 1000),
      })
      .returning();
    admin = created!;
    await db.insert(authCredentials).values({
      userId: admin.id,
      passwordHash: hashPassword(ADMIN_PASSWORD),
    });
    await db.insert(notificationPreferences).values({ userId: admin.id });
    await db.insert(userStreaks).values({ userId: admin.id });
    await db.insert(userCategories).values([
      { userId: admin.id, categoryId: categoryIds.get("ai-at-work")!, rank: 1 },
      { userId: admin.id, categoryId: categoryIds.get("privacy-security")!, rank: 2 },
      { userId: admin.id, categoryId: categoryIds.get("ai-basics")!, rank: 3 },
    ]);
  }
  console.log(`  admin: ${ADMIN_EMAIL} / ${secret(ADMIN_PASSWORD)}`);

  /* ---------- demo learners ----------
   * Two accounts so the access rules can be exercised without hand-crafting
   * users: one inside the anchor organisation, one solo on a free-email domain
   * whose trial has already lapsed.
   */
  const LEARNERS = [
    {
      email: "learner@adelaide.edu.au",
      nickname: "learner",
      orgId: org.id,
      ageRange: "25-34" as const,
      /** Inside the pilot organisation, so entitled through the org licence. */
      trialDays: 7,
      visible: true,
    },
    {
      email: "solo@gmail.com",
      nickname: "solouser",
      orgId: null,
      ageRange: "35-44" as const,
      /** Trial already lapsed - this is the free tier the paywall tests use. */
      trialDays: -1,
      visible: false,
    },
  ];

  for (const l of LEARNERS) {
    const existing = await db.query.users.findFirst({ where: eq(users.email, l.email) });
    if (existing) continue;
    const [row] = await db
      .insert(users)
      .values({
        cognitoSub: `dev_seed_${randomUUID()}`,
        email: l.email,
        emailDomain: l.email.split("@")[1]!,
        emailVerified: true,
        nickname: l.nickname,
        avatarKey: "spark",
        ageRange: l.ageRange,
        role: "learner",
        orgId: l.orgId,
        orgVisible: l.visible,
        isFoundingMember: l.orgId !== null,
        termsAcceptedAt: new Date(),
        onboardedAt: new Date(),
        trialEndsAt: new Date(Date.now() + l.trialDays * 24 * 3600 * 1000),
      })
      .returning();
    await db.insert(authCredentials).values({
      userId: row!.id,
      passwordHash: hashPassword(LEARNER_PASSWORD),
    });
    await db.insert(notificationPreferences).values({ userId: row!.id });
    await db.insert(userStreaks).values({ userId: row!.id });
    await db.insert(userCategories).values([
      { userId: row!.id, categoryId: categoryIds.get("ai-at-work")!, rank: 1 },
      { userId: row!.id, categoryId: categoryIds.get("privacy-security")!, rank: 2 },
      { userId: row!.id, categoryId: categoryIds.get("ai-basics")!, rank: 3 },
    ]);
  }
  console.log(
    `  learners: learner@adelaide.edu.au, solo@gmail.com / ${secret(LEARNER_PASSWORD)}`,
  );

  /* ---------- hashtags ---------- */
  const tagIds = new Map<string, string>();
  const allTags = [...new Set(TOPICS.flatMap((c) => c.tags))];
  for (const tag of allTags) {
    const existing = await db.query.hashtags.findFirst({ where: eq(hashtags.tag, tag) });
    if (existing) {
      tagIds.set(tag, existing.id);
      continue;
    }
    const [row] = await db.insert(hashtags).values({ tag }).returning({ id: hashtags.id });
    tagIds.set(tag, row!.id);
  }

  /* ---------- topics + episodes + resources ---------- */
  let topicCount = 0;
  let episodeCount = 0;
  let resourceCount = 0;

  for (const c of TOPICS) {
    const existing = await db.query.topics.findFirst({
      where: eq(topics.slug, c.slug),
      columns: { id: true },
    });

    if (existing) {
      // Backfill the columns added after this topic was first seeded. `coalesce`
      // means an admin's own copy is never overwritten by a re-run.
      await db
        .update(topics)
        .set({
          whyLearn: sql`coalesce(${topics.whyLearn}, ${c.whyLearn})`,
          outcomes: sql`coalesce(${topics.outcomes}, ${c.outcomes})`,
          introVideoKey: sql`coalesce(${topics.introVideoKey}, ${introVideoKey(c.slug)})`,
          introDurationSec: sql`coalesce(${topics.introDurationSec}, ${c.introDurationSec})`,
        })
        .where(eq(topics.id, existing.id));

      resourceCount += await seedResources(existing.id, c.resources);
      continue;
    }

    const publishedAt = new Date(Date.now() - c.publishedDaysAgo * 24 * 3600 * 1000);
    const totalDuration = c.episodes.reduce((sum, l) => sum + l.durationSec, 0);

    const [topic] = await db
      .insert(topics)
      .values({
        type: "topic",
        slug: c.slug,
        title: c.title,
        excerpt: c.excerpt,
        body: c.body,
        whyLearn: c.whyLearn,
        outcomes: c.outcomes,
        // Placeholder until a real intro is uploaded through /admin.
        introVideoKey: introVideoKey(c.slug),
        introDurationSec: c.introDurationSec,
        skillLevel: "basic",
        origin: "platform",
        pricingModel: "subscription",
        isFree: c.isFree ?? false,
        freeOrder: c.freeOrder,
        status: "published",
        publishedAt,
        authorId: admin.id,
        affiliateTool: c.affiliateTool,
        affiliateUrl: c.affiliateUrl,
        disclosureText: c.affiliateTool
          ? `This topic contains an affiliate link for ${c.affiliateTool}.`
          : null,
        episodeCount: c.episodes.length,
        totalDurationSec: totalDuration,
        viewCount: c.viewCount,
        impressionCount: c.impressionCount,
        likeCount: Math.round(c.viewCount * 0.08),
        bookmarkCount: Math.round(c.viewCount * 0.05),
      })
      .returning({ id: topics.id });

    await db.insert(topicCategories).values(
      c.categories.map((slug) => ({
        topicId: topic!.id,
        categoryId: categoryIds.get(slug)!,
      })),
    );

    await db.insert(topicHashtags).values(
      c.tags.map((tag) => ({ topicId: topic!.id, hashtagId: tagIds.get(tag)! })),
    );

    await db.insert(episodes).values(
      c.episodes.map((l, i) => ({
        topicId: topic!.id,
        slug: `${c.slug}-${i + 1}`,
        title: l.title,
        sortOrder: i + 1,
        durationSec: l.durationSec,
        isPreview: l.isPreview ?? false,
        // Seeded episodes have no media yet - upload through /admin.
        uploadStatus: "pending" as const,
      })),
    );

    resourceCount += await seedResources(topic!.id, c.resources);

    topicCount++;
    episodeCount += c.episodes.length;
  }

  console.log(`  topics: ${topicCount} new (${episodeCount} episodes)`);
  console.log(`  resources: ${resourceCount} new (prompts and links)`);

  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(topics);
  console.log(`\nDone. ${total} topics in the database.`);
  console.log("Sign in at http://localhost:3000/login\n");
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
