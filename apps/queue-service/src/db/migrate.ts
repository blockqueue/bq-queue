import { migrate } from 'drizzle-orm/postgres-js/migrator';
import path from 'path';
import { logger } from '../utils/logger';
import { DB_SCHEMA } from './constants';
import { createDatabaseClient } from './index';

const migrationsFolder = path.join(__dirname, 'migrations');

export async function runMigrations(): Promise<void> {
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
    throw error;
  } finally {
    await db.$client.end();
  }
}

function isMainModule(): boolean {
  return require.main === module;
}

if (isMainModule()) {
  runMigrations().catch((err) => {
    logger.error({ err }, 'Migration failed');
    process.exit(1);
  });
}
