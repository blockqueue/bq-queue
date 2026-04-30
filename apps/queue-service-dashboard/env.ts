import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.string(),

  DATABASE_URL: z.string(),
  POSTGRES_HOST: z.string(),
  POSTGRES_PORT: z.string(),

  PGBOSS_SCHEMA: z.string().optional(),

  PGBOSS_DASHBOARD_JWT_SECRET: z.string().optional(),

  AUTH_SCHEMA: z.string().optional(),
  AUTH_REGISTRATION_API_KEY: z.string().optional(),
  AUTH_REGISTRATION_BULK_MAX_SIZE: z.string().optional(),
  AUTH_REGISTRATION_RATE_LIMIT_MAX_REQUESTS: z.string().optional(),
  AUTH_REGISTRATION_RATE_LIMIT_WINDOW_MS: z.string().optional(),

  AUTH_DEFAULT_USER_FORCE_RESET: z.string().optional(),
  AUTH_DEFAULT_USER_ENABLED: z.string().optional(),
  AUTH_DEFAULT_USER_EMAIL: z.string().optional(),
  AUTH_DEFAULT_USER_PASSWORD: z.string().optional(),
});

type EnvSchemaType = z.infer<typeof EnvSchema>;

declare global {
  namespace NodeJS {
    interface ProcessEnv extends EnvSchemaType {}
  }
}

const env: EnvSchemaType = {
  NODE_ENV: process.env.NODE_ENV || 'development',

  DATABASE_URL: process.env.DATABASE_URL,
  POSTGRES_HOST: process.env.POSTGRES_HOST,
  POSTGRES_PORT: process.env.POSTGRES_PORT,

  PGBOSS_SCHEMA: process.env.PGBOSS_SCHEMA ?? 'pgboss',

  PGBOSS_DASHBOARD_JWT_SECRET: process.env.PGBOSS_DASHBOARD_JWT_SECRET,

  AUTH_SCHEMA: process.env.AUTH_SCHEMA ?? 'auth',
  AUTH_REGISTRATION_API_KEY: process.env.AUTH_REGISTRATION_API_KEY,
  AUTH_REGISTRATION_BULK_MAX_SIZE:
    process.env.AUTH_REGISTRATION_BULK_MAX_SIZE ?? '100',
  AUTH_REGISTRATION_RATE_LIMIT_MAX_REQUESTS:
    process.env.AUTH_REGISTRATION_RATE_LIMIT_MAX_REQUESTS ?? '10',
  AUTH_REGISTRATION_RATE_LIMIT_WINDOW_MS:
    process.env.AUTH_REGISTRATION_RATE_LIMIT_WINDOW_MS ?? '60000',

  AUTH_DEFAULT_USER_ENABLED: process.env.AUTH_DEFAULT_USER_ENABLED ?? 'false',
  AUTH_DEFAULT_USER_EMAIL: process.env.AUTH_DEFAULT_USER_EMAIL,
  AUTH_DEFAULT_USER_PASSWORD: process.env.AUTH_DEFAULT_USER_PASSWORD,
};

EnvSchema.parse(env);

export default env;
