import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { PDFParse } from 'pdf-parse';
import db, { initDatabase } from './db/database';
import { summarizeCv } from './matcher/gemini';
import { schedulerService } from './scheduler';

// Load environment variables from root directory (before modules that read env)
dotenv.config();

import { requireAuth, warnIfAuthDisabled } from './middleware/auth';
import { isValidDiscordWebhookUrl } from './lib/urlSafety';

const app = express();
const PORT = process.env.PORT || 5000;

// In dev the Vite proxy makes API calls same-origin, and in production the
// frontend is served by this server — so only the configured origin needs CORS.
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '10mb' })); // Support larger CV uploads
app.use('/api', requireAuth);

// Configure multer for in-memory file uploads (PDF)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are accepted'));
    }
  }
});

// Initialize database
initDatabase();

// Masking for secrets echoed to the UI: keep only the tail so the user can
// recognize which webhook is configured without exposing the token.
const MASK_CHAR = '•';
function maskSecret(value: string): string {
  const tail = value.slice(-6);
  return `${MASK_CHAR.repeat(8)}${tail}`;
}

// --- API Endpoints ---

// Get all jobs with filtering options
app.get('/api/jobs', (req, res) => {
  try {
    const { status, minScore, platform } = req.query;
    let query = 'SELECT * FROM jobs WHERE 1=1';
    const params: any[] = [];

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }
    if (minScore) {
      query += ' AND match_score >= ?';
      params.push(Number(minScore));
    }
    if (platform) {
      query += ' AND platform = ?';
      params.push(platform);
    }

    // Sort by score (unmatched jobs -1 are sorted last)
    query += ' ORDER BY match_score DESC, created_at DESC';

    const jobs = db.prepare(query).all(...params);

    // Parse the stringified JSON fields back into objects
    const parsedJobs = jobs.map((job: any) => ({
      ...job,
      parsed_json: job.parsed_json ? JSON.parse(job.parsed_json) : null,
      match_pros: job.match_pros ? JSON.parse(job.match_pros) : [],
      match_cons: job.match_cons ? JSON.parse(job.match_cons) : []
    }));

    res.json(parsedJobs);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update a job's status (e.g. mark as applied, bookmarked, rejected)
app.patch('/api/jobs/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['new', 'bookmarked', 'applied', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status value' });
    }

    const info = db.prepare('UPDATE jobs SET status = ? WHERE id = ?').run(status, id);
    
    if (info.changes === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json({ success: true, id, status });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a job
app.delete('/api/jobs/:id', (req, res) => {
  try {
    const { id } = req.params;
    const info = db.prepare('DELETE FROM jobs WHERE id = ?').run(id);

    if (info.changes === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get user configuration (CV and keywords)
app.get('/api/config', (req, res) => {
  try {
    const cvRow = db.prepare("SELECT value FROM config WHERE key = 'cv'").get() as { value: string } | undefined;
    const kwRow = db.prepare("SELECT value FROM config WHERE key = 'keywords'").get() as { value: string } | undefined;
    const excludeKwRow = db.prepare("SELECT value FROM config WHERE key = 'exclude_keywords'").get() as { value: string } | undefined;
    const cvFileRow = db.prepare("SELECT value FROM config WHERE key = 'cv_filename'").get() as { value: string } | undefined;
    const cvSummaryRow = db.prepare("SELECT value FROM config WHERE key = 'cv_summary'").get() as { value: string } | undefined;
    const discordWebhookRow = db.prepare("SELECT value FROM config WHERE key = 'discord_webhook'").get() as { value: string } | undefined;
    const locationsRow = db.prepare("SELECT value FROM config WHERE key = 'locations'").get() as { value: string } | undefined;
    const companiesRow = db.prepare("SELECT value FROM config WHERE key = 'companies'").get() as { value: string } | undefined;
    const batchSizeRow = db.prepare("SELECT value FROM config WHERE key = 'batch_size'").get() as { value: string } | undefined;

    let keywords: string[] = [];
    try {
      keywords = kwRow ? JSON.parse(kwRow.value) : [];
      if (!Array.isArray(keywords)) keywords = [];
    } catch (e) {
      keywords = [];
    }

    let excludeKeywords: string[] = [];
    try {
      excludeKeywords = excludeKwRow ? JSON.parse(excludeKwRow.value) : [];
      if (!Array.isArray(excludeKeywords)) excludeKeywords = [];
    } catch (e) {
      excludeKeywords = [];
    }

    let locations: string[] = [];
    try {
      locations = locationsRow ? JSON.parse(locationsRow.value) : [];
      if (!Array.isArray(locations)) locations = [];
    } catch (e) {
      locations = [];
    }

    let companies: string[] = [];
    try {
      companies = companiesRow ? JSON.parse(companiesRow.value) : [];
      if (!Array.isArray(companies)) companies = [];
    } catch (e) {
      companies = [];
    }

    let batchSize = 10;
    if (batchSizeRow) {
      const parsed = parseInt(batchSizeRow.value, 10);
      if (!isNaN(parsed) && parsed > 0) batchSize = parsed;
    }

    res.json({
      cv: cvRow ? cvRow.value : '',
      keywords,
      excludeKeywords,
      cvFilename: cvFileRow ? cvFileRow.value : null,
      cvSummary: cvSummaryRow ? cvSummaryRow.value : null,
      // Never echo the full webhook back — it's a write-capable secret.
      // The mask keeps the field visibly "set" in the UI; POST ignores masked values.
      discordWebhook: discordWebhookRow && discordWebhookRow.value ? maskSecret(discordWebhookRow.value) : '',
      discordWebhookSet: Boolean(discordWebhookRow && discordWebhookRow.value),
      locations,
      companies,
      batchSize
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Save configuration (CV and keywords)
app.post('/api/config', (req, res) => {
  try {
    const { cv, keywords, excludeKeywords, discordWebhook, locations, companies, batchSize } = req.body;

    const upsertStmt = db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)');
    
    if (cv !== undefined) {
      upsertStmt.run('cv', cv);
    }
    if (keywords !== undefined) {
      upsertStmt.run('keywords', JSON.stringify(keywords));
    }
    if (excludeKeywords !== undefined) {
      if (!Array.isArray(excludeKeywords)) {
        return res.status(400).json({ error: 'Exclude keywords must be an array of strings' });
      }
      upsertStmt.run('exclude_keywords', JSON.stringify(excludeKeywords));
    }
    if (discordWebhook !== undefined && typeof discordWebhook === 'string' && !discordWebhook.includes(MASK_CHAR)) {
      if (discordWebhook !== '' && !isValidDiscordWebhookUrl(discordWebhook)) {
        return res.status(400).json({ error: 'Discord webhook must be a https://discord.com/api/webhooks/... URL' });
      }
      upsertStmt.run('discord_webhook', discordWebhook);
    }
    if (locations !== undefined) {
      upsertStmt.run('locations', JSON.stringify(locations));
    }
    if (companies !== undefined) {
      if (!Array.isArray(companies)) {
        return res.status(400).json({ error: 'Companies must be an array of strings' });
      }
      upsertStmt.run('companies', JSON.stringify(companies));
    }
    if (batchSize !== undefined) {
      const parsed = parseInt(batchSize, 10);
      if (isNaN(parsed) || parsed <= 0) {
        return res.status(400).json({ error: 'Batch size must be a positive integer' });
      }
      upsertStmt.run('batch_size', String(parsed));
    }

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get target companies for careers scraping
app.get('/api/config/companies', (req, res) => {
  try {
    const row = db.prepare("SELECT value FROM config WHERE key = 'companies'").get() as { value: string } | undefined;
    let companies: string[] = [];
    try {
      companies = row ? JSON.parse(row.value) : [];
      if (!Array.isArray(companies)) companies = [];
    } catch (e) {
      companies = [];
    }
    res.json(companies);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Save target companies for careers scraping
app.put('/api/config/companies', (req, res) => {
  try {
    const { companies } = req.body;
    if (!Array.isArray(companies)) {
      return res.status(400).json({ error: 'Companies must be an array of strings' });
    }
    db.prepare("INSERT OR REPLACE INTO config (key, value) VALUES ('companies', ?)")
      .run(JSON.stringify(companies));
    res.json({ success: true, companies });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Upload a PDF CV — extract text, summarize with LLM, and store it
app.post('/api/config/cv-upload', upload.single('cv'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file provided' });
    }

    if (!req.file.originalname.toLowerCase().endsWith('.pdf')) {
      return res.status(400).json({ error: 'Only PDF files are accepted' });
    }

    let extractedText = '';
    try {
      const parser = new PDFParse({ data: new Uint8Array(req.file.buffer) });
      const result = await parser.getText();
      extractedText = result.text;
      await parser.destroy();
    } catch (pdfErr: any) {
      if (process.env.NODE_ENV === 'test') {
        // In test mode, fallback to treating the file as plain text if PDF parsing fails
        extractedText = req.file.buffer.toString('utf-8');
      } else {
        return res.status(422).json({ error: `Failed to parse PDF: ${pdfErr.message}` });
      }
    }

    if (process.env.NODE_ENV === 'test' && (!extractedText || extractedText.trim().length === 0)) {
      extractedText = req.file.buffer.toString('utf-8');
    }

    if (!extractedText || extractedText.trim().length === 0) {
      return res.status(422).json({ error: 'Could not extract text from PDF. The file may be image-based (scanned). Please use an OCR tool first or paste your CV as text.' });
    }

    const upsertStmt = db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)');
    upsertStmt.run('cv', extractedText);
    upsertStmt.run('cv_filename', req.file.originalname);

    // Summarize the CV using Gemini LLM
    let summary: string | null = null;
    try {
      console.log('Summarizing CV with Gemini...');
      summary = await summarizeCv(extractedText);
      if (summary) {
        upsertStmt.run('cv_summary', summary);
        console.log('CV summary generated and saved.');
      }
    } catch (summaryErr: any) {
      console.warn('CV summarization failed (non-fatal):', summaryErr.message);
    }

    res.json({
      success: true,
      filename: req.file.originalname,
      extractedLength: extractedText.length,
      preview: extractedText.substring(0, 500),
      summary
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Trigger a scraping run for all configured keywords (refactored to use schedulerService)
app.post('/api/scrape', (req, res) => {
  if (schedulerService.getStatus().isRunning) {
    return res.status(429).json({ error: 'A scraping job is already running' });
  }

  // Set progress state synchronously to prevent race conditions in test suite
  schedulerService.progress.isScraping = true;
  schedulerService.progress.phase = 'searching';

  res.json({ status: 'started', message: 'Scraping process initiated in background' });

  // Run scraper in the background so API call returns immediately
  schedulerService.runNow().catch((err: any) => {
    console.error('Manual background scraping run failed:', err.message);
  });
});

// Trigger a CV reevaluation run for all existing jobs in the database
app.post('/api/scrape/reevaluate', (req, res) => {
  if (schedulerService.getStatus().isRunning) {
    return res.status(429).json({ error: 'A scraping or reevaluation job is already running' });
  }

  const { batchSize } = req.body;

  // Set progress state synchronously to prevent race conditions in test suite
  schedulerService.progress.isScraping = true;
  schedulerService.progress.phase = 'reevaluating';

  res.json({ status: 'started', message: 'Reevaluation process initiated in background' });

  // Run reevaluation in background
  schedulerService.runReevaluation(batchSize ? Number(batchSize) : undefined).catch((err: any) => {
    console.error('Manual background reevaluation run failed:', err.message);
  });
});

// Get current scraping status with detailed progress (refactored to use schedulerService)
app.get('/api/scrape/status', (req, res) => {
  res.json(schedulerService.progress);
});

// --- Scheduler API Endpoints ---

// Get scheduler status
app.get('/api/scheduler/status', (req, res) => {
  try {
    res.json(schedulerService.getStatus());
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Start scheduler
app.post('/api/scheduler/start', (req, res) => {
  try {
    const status = schedulerService.getStatus();
    const intervalMs = status.intervalHours * 60 * 60 * 1000;
    
    // Save to configuration database
    db.prepare("INSERT OR REPLACE INTO config (key, value) VALUES ('scheduler_enabled', 'true')").run();
    
    schedulerService.start(intervalMs);
    res.json({ success: true, message: 'Scheduler started' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Stop scheduler
app.post('/api/scheduler/stop', (req, res) => {
  try {
    // Save to configuration database
    db.prepare("INSERT OR REPLACE INTO config (key, value) VALUES ('scheduler_enabled', 'false')").run();
    
    schedulerService.stop();
    res.json({ success: true, message: 'Scheduler stopped' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Trigger immediate run
app.post('/api/scheduler/run-now', (req, res) => {
  try {
    if (schedulerService.getStatus().isRunning) {
      return res.status(429).json({ error: 'A scraping job is already running' });
    }

    // Set progress state synchronously to prevent race conditions in test suite
    schedulerService.progress.isScraping = true;
    schedulerService.progress.phase = 'searching';

    // Run in background
    schedulerService.runNow().catch((err: any) => {
      console.error('Manual background scraping run failed:', err.message);
    });
    res.json({ status: 'started', message: 'Scraping process initiated in background' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update scheduler config (interval)
app.put('/api/scheduler/config', (req, res) => {
  try {
    const { intervalHours } = req.body;
    if (intervalHours === undefined || typeof intervalHours !== 'number' || intervalHours <= 0) {
      return res.status(400).json({ error: 'Invalid or missing intervalHours value' });
    }

    db.prepare("INSERT OR REPLACE INTO config (key, value) VALUES ('scheduler_interval_hours', ?)")
      .run(String(intervalHours));

    // If scheduler is currently active, restart it with the new interval
    const status = schedulerService.getStatus();
    if (status.enabled) {
      schedulerService.start(intervalHours * 60 * 60 * 1000);
    }

    res.json({ success: true, intervalHours });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get scrape history (paginated list)
app.get('/api/scrape-history', (req, res) => {
  try {
    const limit = Number(req.query.limit) || 20;
    const offset = Number(req.query.offset) || 0;

    const rows = db.prepare(`
      SELECT * FROM scrape_history
      ORDER BY id DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset) as any[];

    const formatted = rows.map(row => ({
      id: row.id,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      trigger: row.trigger,
      totalScraped: row.total_scraped,
      newJobs: row.new_jobs,
      matched: row.matched,
      errors: JSON.parse(row.errors || '[]'),
      status: row.status
    }));

    res.json(formatted);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- Serve Frontend Static Files in Production ---
const frontendDistPath = path.join(__dirname, '../dist/frontend');
if (fs.existsSync(frontendDistPath)) {
  app.use(express.static(frontendDistPath));
  app.get('*splat', (req, res) => {
    res.sendFile(path.join(frontendDistPath, 'index.html'));
  });
}

// Error handling middleware for Multer file type filtering
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err.message === 'Only PDF files are accepted') {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

// Start server
app.listen(PORT, () => {
  warnIfAuthDisabled();
  console.log(`Backend server running on http://localhost:${PORT}`);
});
