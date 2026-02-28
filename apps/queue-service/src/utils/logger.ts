import pino from 'pino';

/**
 * Logger instance for the application
 * Uses Pino for fast, structured JSON logging
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});
