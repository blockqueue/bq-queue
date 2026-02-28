import { defineConfig } from 'drizzle-kit';
import { DB_SCHEMA } from './src/db/constants';
import env from './src/env';

const databaseURL = env.POSTGRES_DATABASE_URL;
const databaseSSL = env.POSTGRES_SSL === 'true';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './src/db/migrations',
  dbCredentials: {
    url: databaseURL,
    ssl: databaseSSL ? { rejectUnauthorized: true } : false,
  },
  migrations: {
    table: `__${DB_SCHEMA}_drizzle_migrations`.toLowerCase(),
    schema: DB_SCHEMA,
    prefix: 'timestamp',
  },
  schemaFilter: [DB_SCHEMA],
});
