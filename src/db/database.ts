import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_FILE = process.env.DB_FILE || path.join(process.cwd(), 'jobs.db');

// Ensure db directory exists if we put it elsewhere, but process.cwd() is fine for jobs.db
const db = new Database(DB_FILE);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

// Initialize database schema
export function initDatabase() {
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

  // Create config table for settings like CV text, keywords
  db.prepare(`
    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `).run();

  // Create table for caching discovered career page URLs
  db.prepare(`
    CREATE TABLE IF NOT EXISTS career_page_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_name TEXT UNIQUE NOT NULL,
      career_url TEXT NOT NULL,
      discovered_at TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `).run();

  // Create table for scrape history
  db.prepare(`
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

  // Seed default configuration values if they do not exist
  const insertConfig = db.prepare("INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)");
  insertConfig.run("scheduler_interval_hours", "4");
  insertConfig.run("scheduler_enabled", "false");

  console.log('Database initialized successfully at:', DB_FILE);
}

export default db;
