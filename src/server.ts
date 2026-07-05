import config from './config'; // loads .env first — keep as the first import
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import db, { initDatabase } from './db/database';
import { schedulerService } from './scheduler';
import { requireAuth, warnIfAuthDisabled } from './middleware/auth';
import jobsRouter from './routes/jobs';
import configRouter from './routes/config';
import scrapeRouter from './routes/scrape';
import analyticsRouter from './routes/analytics';

const app = express();
const PORT = config.PORT;

// In dev the Vite proxy makes API calls same-origin, and in production the
// frontend is served by this server — so only the configured origin needs CORS.
app.use(cors({ origin: config.CORS_ORIGIN }));
app.use(express.json({ limit: '10mb' })); // Support larger CV uploads
app.use('/api', requireAuth);

// Initialize database
initDatabase();

// Liveness/readiness probe (used by Docker HEALTHCHECK and monitoring)
app.get('/healthz', (req, res) => {
  let dbOk = false;
  try {
    db.prepare('SELECT 1').get();
    dbOk = true;
  } catch {
    // fall through with dbOk = false
  }
  const status = schedulerService.getStatus();
  res.status(dbOk ? 200 : 503).json({
    status: dbOk ? 'ok' : 'degraded',
    dbOk,
    schedulerEnabled: status.enabled,
    schedulerNextRun: status.nextRunAt,
    uptimeSeconds: Math.round(process.uptime()),
  });
});

// --- API routes ---
app.use('/api/jobs', jobsRouter);
app.use('/api/config', configRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api', scrapeRouter); // /api/scrape*, /api/scheduler/*, /api/scrape-history

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
const server = app.listen(PORT, () => {
  warnIfAuthDisabled();
  if (!config.GEMINI_API_KEY && !config.mockGemini) {
    console.warn(
      '[gemini] GEMINI_API_KEY is not set — CV summarization and job matching will be skipped. ' +
      'Set it in .env to enable matching.'
    );
  }
  console.log(`Backend server running on http://localhost:${PORT}`);
});

// --- Graceful shutdown & process-level error handling ---
let shuttingDown = false;
function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received — shutting down...`);
  schedulerService.stop();
  server.close(() => {
    try {
      db.close();
    } catch (err: any) {
      console.error('Error closing database:', err.message);
    }
    console.log('Shutdown complete.');
    process.exit(0);
  });
  // In-flight scrapes (Playwright navigations, LLM calls) can take a while;
  // don't hold the process hostage past a reasonable grace period.
  setTimeout(() => {
    console.warn('Forcing exit after shutdown grace period.');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  shutdown('uncaughtException');
});
