import pino from 'pino';

/**
 * Structured logger. Pretty output in interactive dev, JSON lines otherwise.
 * Level via LOG_LEVEL (default info; 'silent' to mute, e.g. in tests).
 */
const isDev = process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  ...(isDev
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
        },
      }
    : {}),
});

export default logger;
