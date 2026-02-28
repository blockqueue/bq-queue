import { z } from 'zod';

/**
 * pg-boss retention and maintenance options (v12). Always applied with sensible defaults.
 * maintenance_interval_seconds is passed to the PgBoss constructor; retention/delete are
 * applied per-queue via createQueue (retentionSeconds, deleteAfterSeconds).
 * @see https://timgit.github.io/pg-boss/#/./api/constructor
 * @see https://timgit.github.io/pg-boss/#/./api/queues
 */
export const CleanupConfigSchema = z.object({
  /** How often pg-boss runs maintenance. Default: 60. */
  maintenance_interval_seconds: z.number().optional(),
  /** (Ignored in pg-boss v12; kept for config compatibility.) */
  archive_completed_after_seconds: z.number().optional(),
  /** (Ignored in pg-boss v12; kept for config compatibility.) */
  archive_failed_after_seconds: z.number().optional(),
  /** Per-queue: seconds jobs stay in created/retry before deletion. Applied as retentionSeconds (days → seconds). Default: 14. */
  retention_days: z.number().optional(),
  /** Per-queue: retain completed jobs this many days before deletion. Applied as deleteAfterSeconds. Default: 7. */
  delete_after_days: z.number().optional(),
  /** Warnings (expired jobs, etc.) are retained for this many days before deletion. Default: 30. */
  warning_retention_days: z.number().optional(),
});

export const GlobalConfigSchema = z.object({
  default_queue_concurrency: z.number().optional(),
  job_polling_interval: z.string().optional(),
  max_concurrent_jobs: z.number().optional(),
  retryLimit: z.number().optional(),
  retryDelay: z.number().optional(),
  retryBackoff: z.boolean().optional(),
  expireInSeconds: z.number().optional(),
});

export const QueueConfigSchema = z.object({
  endpoint: z.string(),
  method: z.string().default('POST'),
  signature_secret: z.string(),
  max_concurrent_jobs: z.number().optional(),
  retryLimit: z.number().optional(),
  retryDelay: z.number().optional(),
  retryBackoff: z.boolean().optional(),
  expireInSeconds: z.number().optional(),
  wait_interval_after_success_seconds: z.number().optional(),
  description: z.string().optional(),
});

export const CronJobConfigSchema = z.object({
  name: z.string(),
  queue: z.string(),
  schedule: z.string(),
  timezone: z.string().default('UTC'),
  timeout: z.number().optional(),
  priority: z.number().optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
});

export const SchedulerConfigSchema = z.object({
  global: GlobalConfigSchema.optional(),
  queues: z.record(z.string(), QueueConfigSchema),
  cron_jobs: z.array(CronJobConfigSchema).optional().default([]),
  cleanup: CleanupConfigSchema.optional(),
});

export type SchedulerConfig = z.infer<typeof SchedulerConfigSchema>;
export type QueueConfig = z.infer<typeof QueueConfigSchema>;
export type CronJobConfig = z.infer<typeof CronJobConfigSchema>;
export type GlobalConfig = z.infer<typeof GlobalConfigSchema>;
export type CleanupConfig = z.infer<typeof CleanupConfigSchema>;
