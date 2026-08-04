/** Server-only configuration. Never import this from a client component. */

function str(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}
function num(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) ? v : fallback;
}
function bool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined) return fallback;
  return v === "true" || v === "1";
}

export const config = {
  appUrl: str("NEXT_PUBLIC_APP_URL", "http://localhost:3000"),
  region: str("AWS_REGION", "ap-southeast-2"),

  cognito: {
    userPoolId: str("COGNITO_USER_POOL_ID"),
    clientId: str("COGNITO_CLIENT_ID"),
    clientSecret: str("COGNITO_CLIENT_SECRET"),
    domain: str("COGNITO_DOMAIN"),
  },
  /**
   * With no Cognito pool configured the app runs a local credential store so the
   * whole product is usable end-to-end without an AWS account. Production must
   * set COGNITO_USER_POOL_ID.
   */
  get devAuth(): boolean {
    return !process.env.COGNITO_USER_POOL_ID;
  },
  sessionSecret: str("AUTH_SESSION_SECRET", "dev-only-insecure-secret-change-me-please-32"),

  s3: {
    videoBucket: str("S3_VIDEO_BUCKET", "acadu-video-dev"),
    assetsBucket: str("S3_ASSETS_BUCKET", "acadu-assets-dev"),
  },
  cloudfront: {
    domain: str("CLOUDFRONT_DOMAIN"),
    keyPairId: str("CLOUDFRONT_KEY_PAIR_ID"),
    privateKey: str("CLOUDFRONT_PRIVATE_KEY"),
  },
  useLocalUploads: bool("USE_LOCAL_UPLOADS", true),

  stripe: {
    secretKey: str("STRIPE_SECRET_KEY"),
    webhookSecret: str("STRIPE_WEBHOOK_SECRET"),
    priceIdIndividual: str("STRIPE_PRICE_ID_INDIVIDUAL"),
    get enabled(): boolean {
      return Boolean(process.env.STRIPE_SECRET_KEY);
    },
  },

  /**
   * Transactional email goes through the data-corner.com.au mailbox for the
   * pilot. SES is the eventual target once production access is approved.
   */
  smtp: {
    host: str("SMTP_HOST", "mail.data-corner.com.au"),
    port: num("SMTP_PORT", 587),
    secure: bool("SMTP_SECURE", false),
    user: str("SMTP_USER"),
    pass: str("SMTP_PASS"),
    from: str("SMTP_FROM", "noreply@data-corner.com.au"),
    fromName: str("SMTP_FROM_NAME", "Acadu"),
  },

  ses: {
    from: str("SES_FROM_ADDRESS", "no-reply@data-corner.com.au"),
    configurationSet: str("SES_CONFIGURATION_SET_TRANSACTIONAL"),
  },

  leads: {
    /** Where new service enquiries are sent. */
    notifyEmail: str("LEAD_NOTIFY_EMAIL", "afhayati@gmail.com"),
  },

  flags: {
    comments: bool("FEATURE_COMMENTS", true),
    search: bool("FEATURE_SEARCH", false),
    share: bool("FEATURE_SHARE", true),
    /**
     * SERVICES_ACTION_PLAN §1: the platform is a funnel, not a revenue line.
     * When true every verified account gets full access and billing UI is hidden.
     */
    freePlatform: bool("FEATURE_FREE_PLATFORM", true),
    billing: bool("FEATURE_BILLING", false),
  },

  limits: {
    minCohortDisplay: num("MIN_COHORT_DISPLAY", 5),
    foundingMemberLimit: num("FOUNDING_MEMBER_LIMIT", 25),
    freeVideoCount: num("FREE_VIDEO_COUNT", 3),
    /**
     * How many episodes of ANY topic a non-paying account may watch. Product
     * decision: the trial is a preview, not full access, so a prospect can
     * sample every topic but must subscribe to finish one.
     */
    previewEpisodeCount: num("PREVIEW_EPISODE_COUNT", 2),
    trialDays: num("TRIAL_DAYS", 7),
    maxNewContentNotificationsPerDay: num("MAX_NEW_CONTENT_NOTIFICATIONS_PER_DAY", 3),
    commentRateLimitPer10Min: num("COMMENT_RATE_LIMIT_PER_10MIN", 5),
    /** Episode hard cap, also enforced by a DB check constraint. */
    maxEpisodeDurationSec: 360,
    maxVideoBytes: 500 * 1024 * 1024,
    maxAttachmentBytes: 25 * 1024 * 1024,
    maxAttachmentsPerTopic: 5,
    maxLinksPerTopic: 10,
  },

  /** Attachment mime allowlist (V1_BUILD_SPEC §3.1). */
  attachmentMimeTypes: [
    "application/pdf",
    "image/png",
    "image/jpeg",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/csv",
  ] as const,

  videoMimeTypes: ["video/mp4", "video/quicktime", "video/x-m4v"] as const,
} as const;

/** Consumer email domains never map to an organisation (TECHNICAL_SPEC §7.1). */
export const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "yahoo.com",
  "yahoo.com.au",
  "ymail.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "proton.me",
  "protonmail.com",
  "aol.com",
  "gmx.com",
  "mail.com",
  "zoho.com",
  "yandex.com",
  "fastmail.com",
  "tutanota.com",
  "bigpond.com",
  "bigpond.net.au",
  "optusnet.com.au",
  "iinet.net.au",
  "tpg.com.au",
]);
