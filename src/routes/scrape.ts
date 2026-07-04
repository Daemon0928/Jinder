import { Router } from 'express';
import db from '../db/database';
import { schedulerService } from '../scheduler';

const router = Router();

// Trigger a scraping run for all configured keywords (guard lives in the scheduler)
router.post('/scrape', (req, res) => {
  if (!schedulerService.tryStartManualScrape()) {
    return res.status(429).json({ error: 'A scraping job is already running' });
  }
  res.json({ status: 'started', message: 'Scraping process initiated in background' });
});

// Trigger a CV reevaluation run for all existing jobs in the database
router.post('/scrape/reevaluate', (req, res) => {
  const { batchSize } = req.body;
  if (!schedulerService.tryStartReevaluation(batchSize ? Number(batchSize) : undefined)) {
    return res.status(429).json({ error: 'A scraping or reevaluation job is already running' });
  }
  res.json({ status: 'started', message: 'Reevaluation process initiated in background' });
});

// Get current scraping status with detailed progress
router.get('/scrape/status', (req, res) => {
  res.json(schedulerService.progress);
});

// --- Scheduler endpoints ---

router.get('/scheduler/status', (req, res) => {
  try {
    res.json(schedulerService.getStatus());
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/scheduler/start', (req, res) => {
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

router.post('/scheduler/stop', (req, res) => {
  try {
    // Save to configuration database
    db.prepare("INSERT OR REPLACE INTO config (key, value) VALUES ('scheduler_enabled', 'false')").run();

    schedulerService.stop();
    res.json({ success: true, message: 'Scheduler stopped' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/scheduler/run-now', (req, res) => {
  try {
    if (!schedulerService.tryStartManualScrape()) {
      return res.status(429).json({ error: 'A scraping job is already running' });
    }
    res.json({ status: 'started', message: 'Scraping process initiated in background' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update scheduler config (interval)
router.put('/scheduler/config', (req, res) => {
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
router.get('/scrape-history', (req, res) => {
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

export default router;
