import Database from 'better-sqlite3';
import path from 'path';
import { computeDedupeKey } from '../lib/dedupe';

const DB_FILE = process.env.DB_FILE || path.join(process.cwd(), 'jobs.db');

const db = new Database(DB_FILE);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

/**
 * Versioned migrations tracked via SQLite's `PRAGMA user_version`.
 * Append new entries with the next version number — never edit shipped ones;
 * initDatabase applies whatever the current database is missing.
 */
const migrations: Array<{ version: number; name: string; up: (d: Database.Database) => void }> = [
  {
    version: 1,
    name: 'initial schema',
    up: (d) => {
      d.prepare(`
        CREATE TABLE IF NOT EXISTS jobs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          job_id TEXT UNIQUE NOT NULL,
          platform TEXT NOT NULL,
          title TEXT NOT NULL,
          company TEXT NOT NULL,
          location TEXT,
          link TEXT NOT NULL,
          description TEXT NOT NULL,
          parsed_json TEXT,
          match_score INTEGER DEFAULT -1,
          match_pros TEXT,
          match_cons TEXT,
          match_justification TEXT,
          status TEXT DEFAULT 'new',
          created_at TEXT DEFAULT (datetime('now', 'localtime'))
        )
      `).run();

      d.prepare(`
        CREATE TABLE IF NOT EXISTS config (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        )
      `).run();

      d.prepare(`
        CREATE TABLE IF NOT EXISTS career_page_cache (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          company_name TEXT UNIQUE NOT NULL,
          career_url TEXT NOT NULL,
          discovered_at TEXT DEFAULT (datetime('now', 'localtime'))
        )
      `).run();

      d.prepare(`
        CREATE TABLE IF NOT EXISTS scrape_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          started_at TEXT NOT NULL,
          finished_at TEXT,
          "trigger" TEXT NOT NULL,
          total_scraped INTEGER DEFAULT 0,
          new_jobs INTEGER DEFAULT 0,
          matched INTEGER DEFAULT 0,
          errors TEXT DEFAULT '[]',
          status TEXT DEFAULT 'running'
        )
      `).run();
    },
  },
  {
    version: 2,
    name: 'cross-platform dedupe key',
    up: (d) => {
      d.prepare('ALTER TABLE jobs ADD COLUMN dedupe_key TEXT').run();
      d.prepare('CREATE INDEX IF NOT EXISTS idx_jobs_dedupe_key ON jobs(dedupe_key)').run();

      // Backfill existing rows
      const rows = d.prepare('SELECT id, company, title FROM jobs').all() as Array<{
        id: number;
        company: string;
        title: string;
      }>;
      const update = d.prepare('UPDATE jobs SET dedupe_key = ? WHERE id = ?');
      for (const row of rows) {
        update.run(computeDedupeKey(row.company, row.title), row.id);
      }
    },
  },
  {
    version: 3,
    name: 'application pipeline: notes column + richer statuses',
    up: (d) => {
      // Per-job free-text notes for the application-tracking board.
      d.prepare('ALTER TABLE jobs ADD COLUMN notes TEXT').run();

      // The pipeline replaces the old flat "bookmarked" flag with a staged
      // funnel (new → interested → applied → interview → offer → rejected).
      // Existing bookmarked rows map cleanly onto "interested".
      d.prepare("UPDATE jobs SET status = 'interested' WHERE status = 'bookmarked'").run();
    },
  },
  {
    version: 4,
    name: 'obsolete listings support',
    up: (d) => {
      d.prepare('ALTER TABLE jobs ADD COLUMN is_obsolete INTEGER DEFAULT 0').run();
      d.prepare('CREATE INDEX IF NOT EXISTS idx_jobs_is_obsolete ON jobs(is_obsolete)').run();
    },
  },
];

export function initDatabase() {
  const currentVersion = db.pragma('user_version', { simple: true }) as number;

  for (const migration of migrations) {
    if (migration.version <= currentVersion) continue;
    const apply = db.transaction(() => {
      migration.up(db);
      db.pragma(`user_version = ${migration.version}`);
    });
    apply();
    console.log(`Applied DB migration ${migration.version}: ${migration.name}`);
  }

  // Seed default configuration values if they do not exist
  const insertConfig = db.prepare('INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)');
  insertConfig.run('scheduler_interval_hours', '4');
  insertConfig.run('scheduler_enabled', 'false');
  insertConfig.run('digest_enabled', 'false');
  insertConfig.run('digest_interval_days', '7');
  insertConfig.run('digest_min_score', '80');
  insertConfig.run('digest_max_jobs', '10');

  console.log('Database initialized successfully at:', DB_FILE);
}

// Initialize on first import so consumers (e.g. the scheduler singleton,
// which reads config in its constructor) never see a missing schema.
// Migrations are idempotent, so an explicit initDatabase() call is harmless.
initDatabase();

export default db;
