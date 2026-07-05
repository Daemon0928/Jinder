import { Router } from 'express';
import db from '../db/database';

const router = Router();

/**
 * Aggregated stats for the analytics dashboard. All queries run against
 * indexes or full scans of a small local table — cheap enough per request.
 */
router.get('/', (req, res) => {
  try {
    const totals = db.prepare(`
      SELECT
        COUNT(*) AS jobs,
        SUM(CASE WHEN match_score >= 0 THEN 1 ELSE 0 END) AS scored,
        SUM(CASE WHEN match_score >= 80 THEN 1 ELSE 0 END) AS highMatches,
        ROUND(AVG(CASE WHEN match_score >= 0 THEN match_score END), 1) AS avgScore
      FROM jobs
    `).get() as { jobs: number; scored: number; highMatches: number; avgScore: number | null };

    // 10-point score buckets over scored jobs (0-9 … 90-100)
    const bucketRows = db.prepare(`
      SELECT MIN(CAST(match_score / 10 AS INTEGER), 9) AS bucket, COUNT(*) AS count
      FROM jobs WHERE match_score >= 0
      GROUP BY MIN(CAST(match_score / 10 AS INTEGER), 9)
    `).all() as Array<{ bucket: number; count: number }>;
    const scoreHistogram = Array.from({ length: 10 }, (_, i) => ({
      bucket: i === 9 ? '90–100' : `${i * 10}–${i * 10 + 9}`,
      count: bucketRows.find((r) => r.bucket === i)?.count ?? 0,
    }));

    const platforms = db.prepare(`
      SELECT platform,
             COUNT(*) AS count,
             ROUND(AVG(CASE WHEN match_score >= 0 THEN match_score END), 1) AS avgScore
      FROM jobs GROUP BY platform ORDER BY count DESC
    `).all();

    const statusCounts = db.prepare(`
      SELECT status, COUNT(*) AS count FROM jobs GROUP BY status ORDER BY count DESC
    `).all();

    const topCompanies = db.prepare(`
      SELECT company,
             COUNT(*) AS count,
             ROUND(AVG(CASE WHEN match_score >= 0 THEN match_score END), 1) AS avgScore
      FROM jobs
      WHERE company != '' AND company != 'Unknown Company'
      GROUP BY company ORDER BY count DESC, avgScore DESC LIMIT 8
    `).all();

    const runs = (db.prepare(`
      SELECT started_at, "trigger", total_scraped, new_jobs, matched, status
      FROM scrape_history ORDER BY id DESC LIMIT 20
    `).all() as any[])
      .reverse()
      .map((r) => ({
        startedAt: r.started_at,
        trigger: r.trigger,
        totalScraped: r.total_scraped,
        newJobs: r.new_jobs,
        matched: r.matched,
        status: r.status,
      }));

    res.json({
      totals: {
        jobs: totals.jobs,
        scored: totals.scored ?? 0,
        highMatches: totals.highMatches ?? 0,
        avgScore: totals.avgScore,
      },
      scoreHistogram,
      platforms,
      statusCounts,
      topCompanies,
      runs,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
