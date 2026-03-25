import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  PORT: z.coerce.number().min(3000).max(10000).transform(String),
  NODE_ENV: z.string(),

  DATABASE_URL: z.string(),
  POSTGRES_HOST: z.string(),
  POSTGRES_PORT: z.string(),

  PGBOSS_SCHEMA: z.string().optional(),

  PGBOSS_DASHBOARD_AUTH_USERNAME: z.string().optional(),
  PGBOSS_DASHBOARD_AUTH_PASSWORD: z.string().optional(),
});

type EnvSchemaType = z.infer<typeof EnvSchema>;

declare global {
  namespace NodeJS {
    interface ProcessEnv extends EnvSchemaType {}
  }
}

const env: EnvSchemaType = {
  PORT: Number(process.env.PORT).toString(),
  NODE_ENV: process.env.NODE_ENV || 'development',

  DATABASE_URL: process.env.DATABASE_URL,
  POSTGRES_HOST: process.env.POSTGRES_HOST,
  POSTGRES_PORT: process.env.POSTGRES_PORT,

  PGBOSS_SCHEMA: process.env.PGBOSS_SCHEMA ?? 'pgboss',

  PGBOSS_DASHBOARD_AUTH_USERNAME: process.env.PGBOSS_DASHBOARD_AUTH_USERNAME,
  PGBOSS_DASHBOARD_AUTH_PASSWORD: process.env.PGBOSS_DASHBOARD_AUTH_PASSWORD,
};

EnvSchema.parse(env);

export default env;
