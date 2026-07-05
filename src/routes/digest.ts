import { Router } from 'express';
import db from '../db/database';
import { digestService } from '../digest';

const router = Router();

// Current digest configuration, channel readiness, and pending job count.
router.get('/status', (req, res) => {
  try {
    res.json(digestService.getStatus());
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// The jobs that a digest would contain right now (no side effects).
router.get('/preview', (req, res) => {
  try {
    res.json(digestService.buildPayload());
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Compose and dispatch a digest immediately to all configured channels.
router.post('/send', async (req, res) => {
  try {
    const payload = await digestService.sendNow();
    res.json({
      success: true,
      sent: payload.jobs.length > 0,
      jobCount: payload.jobs.length,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update digest scheduling settings and (re)arm the timer.
router.put('/config', (req, res) => {
  try {
    const { enabled, intervalDays, minScore, maxJobs } = req.body;
    const upsert = db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)');

    if (enabled !== undefined) {
      if (typeof enabled !== 'boolean') {
        return res.status(400).json({ error: 'enabled must be a boolean' });
      }
      upsert.run('digest_enabled', enabled ? 'true' : 'false');
    }
    if (intervalDays !== undefined) {
      const n = parseInt(intervalDays, 10);
      if (Number.isNaN(n) || n < 1) {
        return res.status(400).json({ error: 'intervalDays must be a positive integer' });
      }
      upsert.run('digest_interval_days', String(n));
    }
    if (minScore !== undefined) {
      const n = parseInt(minScore, 10);
      if (Number.isNaN(n) || n < 0 || n > 100) {
        return res.status(400).json({ error: 'minScore must be between 0 and 100' });
      }
      upsert.run('digest_min_score', String(n));
    }
    if (maxJobs !== undefined) {
      const n = parseInt(maxJobs, 10);
      if (Number.isNaN(n) || n < 1) {
        return res.status(400).json({ error: 'maxJobs must be a positive integer' });
      }
      upsert.run('digest_max_jobs', String(n));
    }

    digestService.reconfigure();
    res.json({ success: true, ...digestService.getSettings() });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
