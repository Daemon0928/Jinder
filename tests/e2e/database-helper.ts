import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_FILE = path.join(process.cwd(), 'jobs.test.db');

export function getTestDb() {
  return new Database(DB_FILE);
}

export function initTestDb() {
  const db = getTestDb();
  
  // Create jobs table
  db.prepare(`
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

  // Create config table
  db.prepare(`
    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `).run();
  
  db.close();
}

export function resetTestDb() {
  const shmFile = `${DB_FILE}-shm`;
  const walFile = `${DB_FILE}-wal`;

  // Try to un-link DB files, but if they are locked, clear tables instead.
  try {
    if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
    if (fs.existsSync(shmFile)) fs.unlinkSync(shmFile);
    if (fs.existsSync(walFile)) fs.unlinkSync(walFile);
  } catch (e) {
    // Truncate tables if file is locked by the active application server
    try {
      const db = getTestDb();
      db.prepare('DELETE FROM jobs').run();
      db.prepare('DELETE FROM config').run();
      db.close();
      return;
    } catch (err) {
      console.warn('Could not reset DB tables:', (err as Error).message);
    }
  }
  initTestDb();
}

export function seedTestDb(
  cvText: string = "TypeScript Developer CV",
  keywords: string[] = ["TypeScript"],
  locations: string[] = ["Budapest"],
  discordWebhook: string = "http://localhost:5001/webhook"
) {
  const db = getTestDb();
  db.prepare("INSERT OR REPLACE INTO config (key, value) VALUES ('cv', ?)").run(cvText);
  db.prepare("INSERT OR REPLACE INTO config (key, value) VALUES ('keywords', ?)").run(JSON.stringify(keywords));
  db.prepare("INSERT OR REPLACE INTO config (key, value) VALUES ('locations', ?)").run(JSON.stringify(locations));
  db.prepare("INSERT OR REPLACE INTO config (key, value) VALUES ('discord_webhook', ?)").run(discordWebhook);
  db.prepare("INSERT OR REPLACE INTO config (key, value) VALUES ('companies', '[]')").run();
  db.prepare("INSERT OR REPLACE INTO config (key, value) VALUES ('scheduler_interval_hours', '4')").run();
  db.prepare("INSERT OR REPLACE INTO config (key, value) VALUES ('scheduler_enabled', 'false')").run();
  db.close();
}
