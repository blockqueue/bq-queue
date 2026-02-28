import { eq } from 'drizzle-orm';
import { db } from '../db';
import { jobIdempotency, type JobIdempotencyRow } from '../db/schema';
import { getBoss } from '../queue/boss';
import { logger } from '../utils/logger';

/**
 * Cancels the pg-boss job (if any) and removes the idempotency record in a transaction.
 * Reusable across one-off, schedule, and delete flows.
 */
export async function clearExistingJob(
  existing: JobIdempotencyRow,
): Promise<void> {
  const boss = getBoss();
  if (boss && existing.pgBossJobId) {
    try {
      await boss.cancel(existing.queue, existing.pgBossJobId);
    } catch (err) {
      logger.warn(
        { err, jobId: existing.pgBossJobId },
        'Cancel existing job failed',
      );
    }
  }

  await db
    .delete(jobIdempotency)
    .where(eq(jobIdempotency.idempotencyKey, existing.idempotencyKey));
}
