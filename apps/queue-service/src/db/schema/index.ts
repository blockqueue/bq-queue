import { pgSchema, text, timestamp } from 'drizzle-orm/pg-core';
import { DB_SCHEMA } from '../constants';

const appSchema = pgSchema(DB_SCHEMA);

export const jobType = {
  ONE_OFF: 'one_off',
  DYNAMIC: 'dynamic',
} as const;
export const jobTypeEnum = appSchema.enum('job_type', [
  jobType.ONE_OFF,
  jobType.DYNAMIC,
]);

export const jobIdempotency = appSchema.table('job_idempotency', {
  idempotencyKey: text('idempotency_key').primaryKey().notNull(),
  jobType: jobTypeEnum('job_type').notNull(),
  pgBossJobId: text('pg_boss_job_id').notNull(),
  queue: text('queue').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type JobIdempotencyRow = typeof jobIdempotency.$inferSelect;
export type JobIdempotencyInsert = typeof jobIdempotency.$inferInsert;
