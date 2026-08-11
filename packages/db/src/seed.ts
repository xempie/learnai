// T02 seed script — idempotent. Safe to run repeatedly: row counts are
// stable across runs.
import { getPool, newId } from "./client.js";
import { CONTENT_SOURCES } from "./seeds/content-sources.js";
import { FREE_MAIL_DOMAINS } from "./seeds/free-mail-domains.js";
import { DISPOSABLE_DOMAINS } from "./seeds/disposable-domains.js";
import { KNOWN_INSTITUTIONS } from "./seeds/known-institutions.js";
import { buildWarmupSchedule } from "./seeds/warmup-schedule.js";

async function seedDomainTable(
  table: "free_mail_domains" | "disposable_domains",
  domains: readonly string[],
): Promise<number> {
  const pool = getPool();
  let inserted = 0;
  for (const domain of domains) {
    const result = await pool.query(
      `INSERT INTO ${table} (domain) VALUES ($1) ON CONFLICT (domain) DO NOTHING`,
      [domain],
    );
    inserted += result.rowCount ?? 0;
  }
  return inserted;
}

async function seedKnownInstitutions(): Promise<number> {
  const pool = getPool();
  let inserted = 0;
  for (const institution of KNOWN_INSTITUTIONS) {
    const result = await pool.query(
      `INSERT INTO known_institutions (domain, name, kind) VALUES ($1, $2, $3)
       ON CONFLICT (domain) DO UPDATE SET name = excluded.name, kind = excluded.kind`,
      [institution.domain, institution.name, institution.kind],
    );
    inserted += result.rowCount ?? 0;
  }
  return inserted;
}

async function seedContentSources(): Promise<number> {
  const pool = getPool();
  let inserted = 0;
  for (const source of CONTENT_SOURCES) {
    const existing = await pool.query<{ id: string }>(
      `SELECT id FROM content_sources WHERE feed_url = $1`,
      [source.feed_url],
    );
    if (existing.rowCount && existing.rowCount > 0) {
      continue;
    }
    await pool.query(
      `INSERT INTO content_sources
         (id, name, homepage_url, feed_url, tier, vertical, ingest_method, poll_interval_min)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        newId(),
        source.name,
        source.homepage_url,
        source.feed_url,
        source.tier,
        source.vertical,
        source.ingest_method,
        source.poll_interval_min,
      ],
    );
    inserted += 1;
  }
  return inserted;
}

async function seedWarmupSchedule(): Promise<number> {
  const pool = getPool();
  let inserted = 0;
  for (const row of buildWarmupSchedule()) {
    const result = await pool.query(
      `INSERT INTO warmup_schedule (day_index, week_index, max_volume, segment)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (day_index) DO UPDATE SET
         week_index = excluded.week_index,
         max_volume = excluded.max_volume,
         segment = excluded.segment`,
      [row.day_index, row.week_index, row.max_volume, JSON.stringify(row.segment)],
    );
    inserted += result.rowCount ?? 0;
  }
  return inserted;
}

export async function seed(): Promise<void> {
  const freeMail = await seedDomainTable("free_mail_domains", FREE_MAIL_DOMAINS);
  const disposable = await seedDomainTable("disposable_domains", DISPOSABLE_DOMAINS);
  const institutions = await seedKnownInstitutions();
  const sources = await seedContentSources();
  const warmup = await seedWarmupSchedule();

  // eslint-disable-next-line no-console
  console.log(
    `Seed complete: ${freeMail} free-mail domains, ${disposable} disposable domains, ` +
      `${institutions} known institutions, ${sources} content sources, ${warmup} warm-up rows.`,
  );
}

// Run automatically when invoked directly (`tsx src/seed.ts`), but not when
// imported by tests.
if (process.argv[1]?.replace(/\\/g, "/").endsWith("src/seed.ts")) {
  seed()
    .then(() => getPool().end())
    .catch((error) => {
      // eslint-disable-next-line no-console
      console.error("Seed failed:", error);
      process.exitCode = 1;
    });
}
