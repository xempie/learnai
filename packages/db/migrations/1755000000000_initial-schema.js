/* eslint-disable */
// T02 — Initial schema migration.
//
// Transcribes LEARN_AI_V1_BUILD_SPEC.md §3 verbatim, with these deliberate
// deviations documented in the build spec / T02 controller decisions:
//
//  * UUID v7 primary keys are generated application-side (see
//    packages/db/src/client.ts `newId()`, backed by the `uuidv7` npm
//    package) rather than a Postgres `uuid_generate_v7()` extension
//    function. No pgcrypto/uuid-ossp extension is required as a result —
//    only `citext`, per §3's instruction, is created below.
//  * Per §3's "circular foreign keys" instruction, the three forward
//    references (organisations.claimed_by -> users, content_items.source_id
//    -> content_sources, content_items.agent_run_id -> agent_runs) are
//    created as plain UUID columns and the FK constraints are added via
//    ALTER TABLE at the end of `up`. `down` drops those three constraints
//    first, then every table, then the enum types, in reverse dependency
//    order.
//  * Three lookup tables not present in §3's SQL listing but required by
//    §4.1 of the spec are created here: `free_mail_domains`,
//    `disposable_domains`, and `known_institutions`. §4.1 explicitly asks
//    for free-mail domains to live in "a seeded table, not a hardcoded
//    array" and for a seed of known Australian institution domain -> name
//    mappings; `disposable_domains` is the natural counterpart for §4.1
//    step 5 (disposable-domain rejection). All three are populated by the
//    seed script (`pnpm run seed`), not by this migration.
//  * The `organisations.member_count` trigger referenced by the §3.2
//    column comment ("denormalised, maintained by trigger") and by §4.1
//    step 7 ("Increment organisations.member_count (trigger, not
//    application code)") is implemented here as a recount-on-write
//    trigger on `users` — simple and correct at V1 scale.

/** @type {import('node-pg-migrate').ColumnDefinitions | undefined} */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`CREATE EXTENSION IF NOT EXISTS citext;`);

  // ---------------------------------------------------------------------
  // §3.1 Enumerated types
  // ---------------------------------------------------------------------
  pgm.sql(`
    CREATE TYPE user_role         AS ENUM ('member','reviewer','admin');
    CREATE TYPE user_tier         AS ENUM ('free','premium');
    CREATE TYPE cohort_track      AS ENUM ('organisation','individual');
    CREATE TYPE send_cadence      AS ENUM ('daily','weekly','none');
    CREATE TYPE content_kind      AS ENUM ('news','technique','video','prompt');
    CREATE TYPE content_status    AS ENUM ('draft','in_review','changes_requested','approved','scheduled','published','rejected','archived');
    CREATE TYPE vertical          AS ENUM ('general','teaching','learning','marketing','management','health');
    CREATE TYPE author_kind       AS ENUM ('agent','human');
    CREATE TYPE review_action     AS ENUM ('approve','reject','request_changes');
    CREATE TYPE ingest_method     AS ENUM ('rss','api','manual');
    CREATE TYPE candidate_status  AS ENUM ('new','selected','rejected','used','expired');
    CREATE TYPE subscription_status AS ENUM ('active','pending_repermission','suppressed','unsubscribed','bounced','complained');
    CREATE TYPE validation_status AS ENUM ('unvalidated','valid','invalid','risky','role_account','spam_trap');
    CREATE TYPE campaign_kind     AS ENUM ('daily','weekly','repermission','transactional');
    CREATE TYPE edition_status    AS ENUM ('planning','in_review','approved','published');
  `);

  // ---------------------------------------------------------------------
  // §3.2 Identity and cohorts
  // ---------------------------------------------------------------------
  pgm.sql(`
    CREATE TABLE organisations (
      id                UUID PRIMARY KEY,
      name              TEXT        NOT NULL,
      slug              TEXT        NOT NULL UNIQUE,
      primary_domain    TEXT        NOT NULL UNIQUE,
      kind              TEXT,                       -- 'university','government','corporate','sme'
      auto_created      BOOLEAN     NOT NULL DEFAULT TRUE,
      claimed_by        UUID,                        -- FK to users(id) added below (circular)
      claimed_at        TIMESTAMPTZ,
      member_count      INTEGER     NOT NULL DEFAULT 0,   -- denormalised, maintained by trigger
      is_anchor_pilot   BOOLEAN     NOT NULL DEFAULT FALSE,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  pgm.sql(`
    CREATE TABLE organisation_domains (
      id                UUID PRIMARY KEY,
      organisation_id   UUID        NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
      domain            TEXT        NOT NULL UNIQUE,       -- registrable domain, lowercase
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX idx_org_domains_domain ON organisation_domains(domain);
  `);

  pgm.sql(`
    CREATE TABLE users (
      id                UUID PRIMARY KEY,
      email             CITEXT      NOT NULL UNIQUE,
      email_domain      TEXT        NOT NULL,              -- registrable domain, derived
      email_verified_at TIMESTAMPTZ,
      display_name      TEXT,
      role              user_role   NOT NULL DEFAULT 'member',
      tier              user_tier   NOT NULL DEFAULT 'free',
      organisation_id   UUID        REFERENCES organisations(id),
      cohort_track      cohort_track NOT NULL,
      job_role          TEXT,
      timezone          TEXT        NOT NULL DEFAULT 'Australia/Sydney',
      date_of_birth     DATE,                              -- see §10.4, under-16 exclusion
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_active_at    TIMESTAMPTZ,
      deleted_at        TIMESTAMPTZ
    );
    CREATE INDEX idx_users_org      ON users(organisation_id) WHERE deleted_at IS NULL;
    CREATE INDEX idx_users_domain   ON users(email_domain);
  `);

  pgm.sql(`
    CREATE TABLE user_preferences (
      user_id           UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      cadence           send_cadence NOT NULL DEFAULT 'daily',
      send_hour_local   SMALLINT     NOT NULL DEFAULT 7 CHECK (send_hour_local BETWEEN 0 AND 23),
      verticals         vertical[]   NOT NULL DEFAULT '{}',    -- empty = all
      push_enabled      BOOLEAN      NOT NULL DEFAULT FALSE,
      push_subscription JSONB,                                  -- Web Push endpoint + keys
      updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
    );
  `);

  pgm.sql(`
    CREATE TABLE organisation_claims (
      id                UUID PRIMARY KEY,
      organisation_id   UUID        NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
      user_id           UUID        NOT NULL REFERENCES users(id),
      status            TEXT        NOT NULL DEFAULT 'pending',  -- pending|approved|rejected
      requested_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      resolved_at       TIMESTAMPTZ,
      resolved_by       UUID        REFERENCES users(id)
    );
  `);

  // ---------------------------------------------------------------------
  // §3.3 Content
  // ---------------------------------------------------------------------
  pgm.sql(`
    CREATE TABLE editions (
      id                UUID PRIMARY KEY,
      edition_date      DATE        NOT NULL UNIQUE,
      headline          TEXT,
      status            edition_status NOT NULL DEFAULT 'planning',
      published_at      TIMESTAMPTZ,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  pgm.sql(`
    CREATE TABLE content_items (
      id                UUID PRIMARY KEY,
      edition_id        UUID        REFERENCES editions(id) ON DELETE SET NULL,
      kind              content_kind NOT NULL,
      title             TEXT        NOT NULL,
      slug              TEXT        NOT NULL UNIQUE,
      body_md           TEXT,                              -- markdown
      summary           TEXT,                              -- <= 200 chars, for cards and meta
      vertical          vertical    NOT NULL DEFAULT 'general',
      video_url         TEXT,
      video_duration_s  INTEGER,
      video_captions_url TEXT,
      source_url        TEXT,                              -- primary source, REQUIRED for kind='news'
      source_id         UUID,                               -- FK to content_sources(id) added below (circular)
      source_tier       SMALLINT    CHECK (source_tier BETWEEN 1 AND 3),
      status            content_status NOT NULL DEFAULT 'draft',
      is_premium        BOOLEAN     NOT NULL DEFAULT FALSE,
      author_kind       author_kind NOT NULL,
      agent_run_id      UUID,                               -- FK to agent_runs(id) added below (circular)
      approved_by       UUID        REFERENCES users(id),
      approved_at       TIMESTAMPTZ,
      second_approved_by UUID       REFERENCES users(id),   -- health/finance dual review
      second_approved_at TIMESTAMPTZ,
      published_at      TIMESTAMPTZ,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

      CONSTRAINT news_needs_source
        CHECK (kind <> 'news' OR source_url IS NOT NULL),
      CONSTRAINT published_needs_approval
        CHECK (status <> 'published' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL))
    );
    CREATE INDEX idx_ci_status    ON content_items(status);
    CREATE INDEX idx_ci_edition   ON content_items(edition_id);
    CREATE INDEX idx_ci_published ON content_items(published_at DESC) WHERE status = 'published';
    CREATE INDEX idx_ci_vertical  ON content_items(vertical) WHERE status = 'published';
    CREATE INDEX idx_ci_fts       ON content_items
      USING GIN (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(body_md,'')));
  `);

  pgm.sql(`
    CREATE TABLE prompts (
      id                UUID PRIMARY KEY,
      title             TEXT        NOT NULL,
      body              TEXT        NOT NULL,
      vertical          vertical    NOT NULL DEFAULT 'general',
      job_role          TEXT,
      is_premium        BOOLEAN     NOT NULL DEFAULT TRUE,   -- 10 free, rest premium
      content_item_id   UUID        REFERENCES content_items(id),
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // ---------------------------------------------------------------------
  // §3.4 Sources and ingestion
  // ---------------------------------------------------------------------
  pgm.sql(`
    CREATE TABLE content_sources (
      id                UUID PRIMARY KEY,
      name              TEXT        NOT NULL,
      homepage_url      TEXT        NOT NULL,
      feed_url          TEXT,
      tier              SMALLINT    NOT NULL CHECK (tier BETWEEN 1 AND 3),
      vertical          vertical    NOT NULL DEFAULT 'general',
      ingest_method     ingest_method NOT NULL DEFAULT 'rss',
      poll_interval_min INTEGER     NOT NULL DEFAULT 240,
      active            BOOLEAN     NOT NULL DEFAULT TRUE,
      last_polled_at    TIMESTAMPTZ,
      last_item_at      TIMESTAMPTZ,
      consecutive_failures INTEGER  NOT NULL DEFAULT 0,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  pgm.sql(`
    CREATE TABLE source_candidates (
      id                UUID PRIMARY KEY,
      source_id         UUID        NOT NULL REFERENCES content_sources(id) ON DELETE CASCADE,
      external_id       TEXT,
      url               TEXT        NOT NULL,
      url_hash          TEXT        NOT NULL UNIQUE,        -- sha256 of normalised URL
      title             TEXT        NOT NULL,
      excerpt           TEXT,
      raw               JSONB,
      published_at      TIMESTAMPTZ,
      fetched_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
      triage_score      NUMERIC(4,3),                       -- 0.000 .. 1.000
      triage_reason     TEXT,
      status            candidate_status NOT NULL DEFAULT 'new',
      expires_at        TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '14 days')
    );
    CREATE INDEX idx_cand_status ON source_candidates(status, triage_score DESC);
  `);

  // ---------------------------------------------------------------------
  // §3.5 Review gate and audit
  // ---------------------------------------------------------------------
  pgm.sql(`
    CREATE TABLE reviews (
      id                UUID PRIMARY KEY,
      content_item_id   UUID        NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
      reviewer_id       UUID        NOT NULL REFERENCES users(id),
      action            review_action NOT NULL,
      notes             TEXT,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX idx_reviews_item ON reviews(content_item_id, created_at DESC);
  `);

  pgm.sql(`
    CREATE TABLE audit_log (
      id                BIGSERIAL PRIMARY KEY,
      actor_kind        author_kind NOT NULL,
      actor_id          UUID,
      action            TEXT        NOT NULL,
      entity_type       TEXT        NOT NULL,
      entity_id         UUID,
      payload           JSONB,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id, created_at DESC);
  `);
  // audit_log is append-only. The application role's grants (no UPDATE/DELETE)
  // are set up when the application DB role is created (see runbook / T14).

  // ---------------------------------------------------------------------
  // §3.6 Email
  // ---------------------------------------------------------------------
  pgm.sql(`
    CREATE TABLE subscriptions (
      id                    UUID PRIMARY KEY,
      user_id               UUID REFERENCES users(id) ON DELETE SET NULL,
      email                 CITEXT NOT NULL UNIQUE,
      email_domain          TEXT NOT NULL,
      consent_source        TEXT,                    -- program name / form
      consent_recorded_at   TIMESTAMPTZ,
      consent_evidence      JSONB,                   -- audit trail, §10.2
      cohort_bucket         SMALLINT,                -- 1=<12mo, 2=1-2y, 3=2-3y, 4=3-4y
      status                subscription_status NOT NULL DEFAULT 'pending_repermission',
      validation_status     validation_status NOT NULL DEFAULT 'unvalidated',
      validated_at          TIMESTAMPTZ,
      repermission_sent_at  TIMESTAMPTZ,
      repermission_optin_at TIMESTAMPTZ,
      last_open_at          TIMESTAMPTZ,
      last_click_at         TIMESTAMPTZ,
      sunset_at             TIMESTAMPTZ,
      unsubscribe_token     TEXT NOT NULL UNIQUE,
      created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX idx_subs_sendable ON subscriptions(status, cohort_bucket)
      WHERE status = 'active';
  `);

  pgm.sql(`
    CREATE TABLE suppression_list (
      email             CITEXT PRIMARY KEY,
      reason            TEXT NOT NULL,               -- hard_bounce|complaint|manual|role|trap|unsubscribe
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  pgm.sql(`
    CREATE TABLE email_campaigns (
      id                UUID PRIMARY KEY,
      kind              campaign_kind NOT NULL,
      edition_id        UUID REFERENCES editions(id),
      subject           TEXT NOT NULL,
      segment           JSONB NOT NULL,              -- declarative segment definition
      scheduled_at      TIMESTAMPTZ,
      started_at        TIMESTAMPTZ,
      completed_at      TIMESTAMPTZ,
      target_count      INTEGER,
      sent_count        INTEGER NOT NULL DEFAULT 0,
      created_by        UUID REFERENCES users(id)
    );
  `);

  pgm.sql(`
    CREATE TABLE email_sends (
      id                BIGSERIAL PRIMARY KEY,
      campaign_id       UUID NOT NULL REFERENCES email_campaigns(id) ON DELETE CASCADE,
      subscription_id   UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
      ses_message_id    TEXT,
      sent_at           TIMESTAMPTZ,
      delivered_at      TIMESTAMPTZ,
      opened_at         TIMESTAMPTZ,
      clicked_at        TIMESTAMPTZ,
      bounced_at        TIMESTAMPTZ,
      bounce_type       TEXT,
      complained_at     TIMESTAMPTZ,
      UNIQUE (campaign_id, subscription_id)
    );
    CREATE INDEX idx_sends_campaign ON email_sends(campaign_id);
  `);

  pgm.sql(`
    CREATE TABLE warmup_schedule (
      day_index         SMALLINT PRIMARY KEY,        -- 1..49
      week_index        SMALLINT NOT NULL,
      max_volume        INTEGER  NOT NULL,
      segment           JSONB    NOT NULL,
      executed_at       TIMESTAMPTZ,
      actual_sent       INTEGER,
      bounce_rate       NUMERIC(5,4),
      complaint_rate    NUMERIC(6,5),
      open_rate         NUMERIC(5,4),
      gate_passed       BOOLEAN,
      gate_notes        TEXT
    );
  `);

  // ---------------------------------------------------------------------
  // §3.7 Agent telemetry, engagement, metrics
  // ---------------------------------------------------------------------
  pgm.sql(`
    CREATE TABLE agent_runs (
      id                UUID PRIMARY KEY,
      agent_name        TEXT NOT NULL,               -- 'triage' | 'draft'
      execution_arn     TEXT,
      model_id          TEXT NOT NULL,
      input_tokens      INTEGER,
      output_tokens     INTEGER,
      latency_ms        INTEGER,
      cost_usd          NUMERIC(10,6),
      status            TEXT NOT NULL,               -- ok|error
      error             TEXT,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  pgm.sql(`
    CREATE TABLE completions (
      id                BIGSERIAL PRIMARY KEY,
      user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      edition_id        UUID REFERENCES editions(id),
      content_item_id   UUID REFERENCES content_items(id),
      seconds_spent     INTEGER,
      completed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (user_id, edition_id)
    );
  `);

  pgm.sql(`
    CREATE TABLE streaks (
      user_id           UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      current_streak    INTEGER NOT NULL DEFAULT 0,
      longest_streak    INTEGER NOT NULL DEFAULT 0,
      last_completed_on DATE
    );
  `);

  // ---------------------------------------------------------------------
  // §4.1 lookup tables — not in §3's SQL listing, required by §4.1's
  // "seeded table, not a hardcoded array" instruction and by the known-
  // institutions / disposable-domain steps of the cohort algorithm.
  // ---------------------------------------------------------------------
  pgm.sql(`
    CREATE TABLE free_mail_domains (
      domain            TEXT PRIMARY KEY,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE disposable_domains (
      domain            TEXT PRIMARY KEY,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE known_institutions (
      domain            TEXT PRIMARY KEY,
      name              TEXT NOT NULL,
      kind              TEXT NOT NULL,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // ---------------------------------------------------------------------
  // Circular foreign keys — added last, per §3's instruction.
  // ---------------------------------------------------------------------
  pgm.sql(`
    ALTER TABLE organisations
      ADD CONSTRAINT organisations_claimed_by_fkey
      FOREIGN KEY (claimed_by) REFERENCES users(id);

    ALTER TABLE content_items
      ADD CONSTRAINT content_items_source_id_fkey
      FOREIGN KEY (source_id) REFERENCES content_sources(id);

    ALTER TABLE content_items
      ADD CONSTRAINT content_items_agent_run_id_fkey
      FOREIGN KEY (agent_run_id) REFERENCES agent_runs(id);
  `);

  // ---------------------------------------------------------------------
  // organisations.member_count trigger (§3.2 comment, §4.1 step 7).
  // Recount-on-write: simple and correct at V1 scale.
  // ---------------------------------------------------------------------
  pgm.sql(`
    CREATE FUNCTION recalc_organisation_member_count() RETURNS TRIGGER AS $fn$
    DECLARE
      affected_org UUID;
    BEGIN
      IF TG_OP = 'DELETE' THEN
        affected_org := OLD.organisation_id;
      ELSE
        affected_org := NEW.organisation_id;
      END IF;

      IF affected_org IS NOT NULL THEN
        UPDATE organisations
        SET member_count = (
          SELECT COUNT(*) FROM users
          WHERE organisation_id = affected_org AND deleted_at IS NULL
        )
        WHERE id = affected_org;
      END IF;

      IF TG_OP = 'UPDATE' AND OLD.organisation_id IS DISTINCT FROM NEW.organisation_id
         AND OLD.organisation_id IS NOT NULL THEN
        UPDATE organisations
        SET member_count = (
          SELECT COUNT(*) FROM users
          WHERE organisation_id = OLD.organisation_id AND deleted_at IS NULL
        )
        WHERE id = OLD.organisation_id;
      END IF;

      RETURN NULL;
    END;
    $fn$ LANGUAGE plpgsql;

    CREATE TRIGGER trg_users_member_count
    AFTER INSERT OR UPDATE OF organisation_id OR DELETE ON users
    FOR EACH ROW EXECUTE FUNCTION recalc_organisation_member_count();
  `);
};

exports.down = (pgm) => {
  // Drop the trigger/function first.
  pgm.sql(`
    DROP TRIGGER IF EXISTS trg_users_member_count ON users;
    DROP FUNCTION IF EXISTS recalc_organisation_member_count();
  `);

  // Drop the three circular FKs before the tables they reference.
  pgm.sql(`
    ALTER TABLE content_items DROP CONSTRAINT IF EXISTS content_items_agent_run_id_fkey;
    ALTER TABLE content_items DROP CONSTRAINT IF EXISTS content_items_source_id_fkey;
    ALTER TABLE organisations DROP CONSTRAINT IF EXISTS organisations_claimed_by_fkey;
  `);

  // Drop lookup tables.
  pgm.sql(`
    DROP TABLE IF EXISTS known_institutions;
    DROP TABLE IF EXISTS disposable_domains;
    DROP TABLE IF EXISTS free_mail_domains;
  `);

  // Drop everything else, in reverse dependency order.
  pgm.sql(`
    DROP TABLE IF EXISTS streaks;
    DROP TABLE IF EXISTS completions;
    DROP TABLE IF EXISTS agent_runs;
    DROP TABLE IF EXISTS warmup_schedule;
    DROP TABLE IF EXISTS email_sends;
    DROP TABLE IF EXISTS email_campaigns;
    DROP TABLE IF EXISTS suppression_list;
    DROP TABLE IF EXISTS subscriptions;
    DROP TABLE IF EXISTS audit_log;
    DROP TABLE IF EXISTS reviews;
    DROP TABLE IF EXISTS source_candidates;
    DROP TABLE IF EXISTS content_sources;
    DROP TABLE IF EXISTS prompts;
    DROP TABLE IF EXISTS content_items;
    DROP TABLE IF EXISTS editions;
    DROP TABLE IF EXISTS organisation_claims;
    DROP TABLE IF EXISTS user_preferences;
    DROP TABLE IF EXISTS users;
    DROP TABLE IF EXISTS organisation_domains;
    DROP TABLE IF EXISTS organisations;
  `);

  // Drop the enum types, reverse of creation order.
  pgm.sql(`
    DROP TYPE IF EXISTS edition_status;
    DROP TYPE IF EXISTS campaign_kind;
    DROP TYPE IF EXISTS validation_status;
    DROP TYPE IF EXISTS subscription_status;
    DROP TYPE IF EXISTS candidate_status;
    DROP TYPE IF EXISTS ingest_method;
    DROP TYPE IF EXISTS review_action;
    DROP TYPE IF EXISTS author_kind;
    DROP TYPE IF EXISTS vertical;
    DROP TYPE IF EXISTS content_status;
    DROP TYPE IF EXISTS content_kind;
    DROP TYPE IF EXISTS send_cadence;
    DROP TYPE IF EXISTS cohort_track;
    DROP TYPE IF EXISTS user_tier;
    DROP TYPE IF EXISTS user_role;
  `);
};
