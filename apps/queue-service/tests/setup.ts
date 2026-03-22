/**
 * Vitest setup: set env vars so env.ts validation passes when tests import app code.
 * Run before any test file; use .env.test locally if present.
 */
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.test') });

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.PORT = process.env.PORT ?? '3000';
process.env.POSTGRES_DATABASE_URL =
  process.env.POSTGRES_DATABASE_URL ?? 'postgres://localhost:5432/test';
process.env.REQUEST_SIGNING_SECRET =
  process.env.REQUEST_SIGNING_SECRET ?? 'test-signing-secret';
