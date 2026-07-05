import { Router } from 'express';
import db from '../db/database';
import { JOB_STATUSES } from '../lib/constants';

const router = Router();

// Parse the stringified JSON fields back into objects
function parseJobRow(job: any) {
  return {
    ...job,
    parsed_json: job.parsed_json ? JSON.parse(job.parsed_json) : null,
    match_pros: job.match_pros ? JSON.parse(job.match_pros) : [],
    match_cons: job.match_cons ? JSON.parse(job.match_cons) : []
  };
}

// Get all jobs with filtering options.
// Without page/limit the full array is returned (legacy shape);
// with ?page=&limit= the response is { jobs, total, page, limit }.
router.get('/', (req, res) => {
  try {
    const { status, minScore, platform, q } = req.query;
    let where = ' FROM jobs WHERE 1=1';
    const params: (string | number)[] = [];

    if (status) {
      where += ' AND status = ?';
      params.push(String(status));
    }
    if (minScore) {
      where += ' AND match_score >= ?';
      params.push(Number(minScore));
    }
    if (platform) {
      where += ' AND platform = ?';
      params.push(String(platform));
    }
    if (q) {
      where += ' AND (title LIKE ? OR company LIKE ?)';
      const like = `%${String(q)}%`;
      params.push(like, like);
    }

    // Sort by score (unmatched jobs -1 are sorted last)
    const orderBy = ' ORDER BY match_score DESC, created_at DESC';

    const paginated = req.query.page !== undefined || req.query.limit !== undefined;
    if (paginated) {
      const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
      const page = Math.max(Number(req.query.page) || 1, 1);
      const total = (db.prepare(`SELECT COUNT(*) AS c${where}`).get(...params) as { c: number }).c;
      const rows = db.prepare(`SELECT *${where}${orderBy} LIMIT ? OFFSET ?`)
        .all(...params, limit, (page - 1) * limit);

      return res.json({ jobs: rows.map(parseJobRow), total, page, limit });
    }

    const rows = db.prepare(`SELECT *${where}${orderBy}`).all(...params);
    res.json(rows.map(parseJobRow));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update a job's pipeline status and/or free-text notes. Both fields are
// optional so the board (status moves) and the details panel (notes) share
// one endpoint; at least one must be present.
router.patch('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    if (status === undefined && notes === undefined) {
      return res.status(400).json({ error: 'Provide status and/or notes to update' });
    }

    const sets: string[] = [];
    const params: (string | number)[] = [];

    if (status !== undefined) {
      if (!JOB_STATUSES.includes(status)) {
        return res.status(400).json({ error: 'Invalid status value' });
      }
      sets.push('status = ?');
      params.push(status);
    }
    if (notes !== undefined) {
      if (typeof notes !== 'string') {
        return res.status(400).json({ error: 'Notes must be a string' });
      }
      sets.push('notes = ?');
      params.push(notes);
    }

    const info = db
      .prepare(`UPDATE jobs SET ${sets.join(', ')} WHERE id = ?`)
      .run(...params, id);

    if (info.changes === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json({ success: true, id, status, notes });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a job
router.delete('/:id', (req, res) => {
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

export default router;
