import { Request, Response, NextFunction } from 'express';

/**
 * Optional bearer-token auth. When AUTH_TOKEN is unset the API stays open
 * (demo / local mode); when set, every /api request must carry
 * `Authorization: Bearer <token>`.
 *
 * AUTH_TOKEN is read per-request (not at module load) so import order
 * relative to dotenv.config() doesn't matter.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.AUTH_TOKEN;
  if (!expected) {
    return next();
  }

  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (token !== expected) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
}

/** Called once at boot to surface the open-API warning. */
export function warnIfAuthDisabled() {
  if (!process.env.AUTH_TOKEN) {
    console.warn(
      '[auth] AUTH_TOKEN is not set — the API is accessible without authentication. ' +
      'Set AUTH_TOKEN in your environment to require a bearer token.'
    );
  }
}
