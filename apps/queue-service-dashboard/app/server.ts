import { createHonoServer } from 'react-router-hono-server/node';

import {
  findDatabaseById,
  getDatabaseConfigs,
  type DatabaseConfig,
} from './lib/config.server';
import env from '../env';
import {
  bulkRegisterUsers,
  ensureAuthTables,
  parseRegisterPayload,
} from './lib/auth-registration.server';
import { checkRateLimit } from './lib/rate-limit.server';

declare module 'react-router' {
  interface AppLoadContext {
    readonly databases: DatabaseConfig[];
    readonly currentDb: DatabaseConfig;
    // Convenience accessors for current database
    readonly DB_URL: string;
    readonly SCHEMA: string;
  }
}

export default createHonoServer({
  beforeAll(app) {
    app.post('/api/auth/register', async (c) => {
      const authHeader = c.req.header('authorization') || ''
      const bearerToken = authHeader.startsWith('Bearer ')
        ? authHeader.slice('Bearer '.length).trim()
        : null

      if (!env.AUTH_REGISTRATION_API_KEY) {
        return c.json(
          { error: 'AUTH_REGISTRATION_API_KEY is not configured' },
          500
        )
      }

      if (!bearerToken || bearerToken !== env.AUTH_REGISTRATION_API_KEY) {
        return c.json({ error: 'Unauthorized' }, 401)
      }

      const ip =
        c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
        c.req.header('x-real-ip') ||
        'unknown'

      const windowMs = Number(env.AUTH_REGISTRATION_RATE_LIMIT_WINDOW_MS || 60000)
      const limit = Number(env.AUTH_REGISTRATION_RATE_LIMIT_MAX_REQUESTS || 10)
      const rateLimit = checkRateLimit(`auth-register:${ip}`, limit, windowMs)

      if (!rateLimit.allowed) {
        c.header('Retry-After', String(rateLimit.retryAfterSeconds))
        return c.json(
          { error: 'Too many registration requests, please retry later.' },
          429
        )
      }

      let payload
      try {
        payload = parseRegisterPayload(await c.req.json())
      } catch (error) {
        return c.json(
          {
            error: 'Invalid payload',
            details: error instanceof Error ? error.message : 'Validation failed',
          },
          400
        )
      }

      const maxBatchSize = Number(env.AUTH_REGISTRATION_BULK_MAX_SIZE || 100)
      if (payload.users.length > maxBatchSize) {
        return c.json(
          {
            error: `Bulk registration exceeds limit of ${maxBatchSize} users`,
          },
          400
        )
      }

      const connectionString = env.DATABASE_URL
      const authSchema = env.AUTH_SCHEMA || 'auth'

      await ensureAuthTables(connectionString, authSchema)
      const result = await bulkRegisterUsers(connectionString, authSchema, payload)

      return c.json(result, 201)
    })
  },
  getLoadContext(c) {
    const databases = getDatabaseConfigs();

    // Get selected database from query param or cookie
    const url = new URL(c.req.url);
    const dbId =
      url.searchParams.get('db') ||
      c.req.header('cookie')?.match(/pgboss_db=([^;]+)/)?.[1] ||
      null;
    const currentDb = findDatabaseById(databases, dbId) || databases[0];

    return {
      databases,
      currentDb,
      // Backwards-compatible accessors
      DB_URL: currentDb?.url || 'postgres://localhost/pgboss',
      SCHEMA: currentDb?.schema || 'pgboss',
    };
  },
});
