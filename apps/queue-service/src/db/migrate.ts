import { migrate } from 'drizzle-orm/postgres-js/migrator';
import path from 'path';
import { logger } from '../utils/logger';
import { DB_SCHEMA } from './constants';
import { createDatabaseClient } from './index';

const __dirname = path.dirname(__filename);
const migrationsFolder = path.join(__dirname, 'migrations');

(async () => {
  // Create database client with migration URL (bypasses RLS)
  const db = createDatabaseClient({ max: 1 });

  try {
    const migrationsTable = `__${DB_SCHEMA}_drizzle_migrations`.toLowerCase();
    logger.info({ schema: DB_SCHEMA, migrationsTable }, 'Running migrations');
    await migrate(db, {
      migrationsFolder,
      migrationsTable,
      migrationsSchema: DB_SCHEMA,
    });
    logger.info('Migrations complete.');
  } catch (error) {
    logger.error({ error }, '❌ Public schema migration failed');
    process.exit(1);
  } finally {
    await db.$client.end();
  }
})();
