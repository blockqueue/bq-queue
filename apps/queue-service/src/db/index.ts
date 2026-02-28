import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import env from '../env';
import * as schema from './schema/index';

// Database URLs - migration URL takes precedence if provided
const databaseURL = env.POSTGRES_DATABASE_URL;
const databaseSSL = env.POSTGRES_SSL === 'true';

// PostgreSQL connection configuration
const connectionConfig = {
  ssl: databaseSSL ? { rejectUnauthorized: false } : false,
  max: 5, // Maximum number of connections
  idle_timeout: 20,
  connect_timeout: 10,
};
const logger = env.NODE_ENV === 'development';

export type DatabaseType = ReturnType<typeof createDatabaseClient>;

export type PostgresTransaction = Parameters<
  Parameters<DatabaseType['transaction']>[0]
>[0];

export function createDatabaseClient(
  options?: postgres.Options<Record<string, never>> | undefined,
) {
  const client = postgres(databaseURL, {
    ...connectionConfig,
    ...(options || {}),
  });
  return drizzle(client, { schema, logger });
}

let dbInstance: ReturnType<typeof createDatabaseClient> | null = null;

function getDbInstance() {
  if (!dbInstance) {
    dbInstance = createDatabaseClient();
  }
  return dbInstance;
}

export const db = getDbInstance();
