import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  PORT: z.coerce.number().min(3000).max(10000).transform(String),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  SCHEDULER_CONFIG_DIR: z.string(),

  POSTGRES_DATABASE_URL: z.string(),
  POSTGRES_SSL: z.string().default('false'),
  DB_SCHEMA: z.string().optional(),

  API_SIGNING_SECRET: z.string().min(1),
});

type EnvSchemaType = z.infer<typeof EnvSchema>;

/* eslint-disable @typescript-eslint/no-namespace, @typescript-eslint/no-empty-object-type */
declare global {
  namespace NodeJS {
    interface ProcessEnv extends EnvSchemaType {}
  }
}
/* eslint-enable @typescript-eslint/no-namespace, @typescript-eslint/no-empty-object-type */

const env: z.infer<typeof EnvSchema> = {
  PORT: Number(process.env.PORT).toString(),
  NODE_ENV: process.env.NODE_ENV || 'development',

  POSTGRES_DATABASE_URL: process.env.POSTGRES_DATABASE_URL,
  POSTGRES_SSL: process.env.POSTGRES_SSL,
  DB_SCHEMA: process.env.DB_SCHEMA,

  API_SIGNING_SECRET: process.env.API_SIGNING_SECRET,
  SCHEDULER_CONFIG_DIR: process.env.SCHEDULER_CONFIG_DIR,
};

EnvSchema.parse(env);

export default env;
