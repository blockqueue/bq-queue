import env from '../env';

/**
 * Database schema name for app tables and migrations.
 * Set DB_SCHEMA in env to override (e.g. DB_SCHEMA=bq_queue).
 */
export const DB_SCHEMA = env.DB_SCHEMA ?? 'bq_queue';
