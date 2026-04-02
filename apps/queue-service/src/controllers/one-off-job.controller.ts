import { eq } from 'drizzle-orm';
import { Request, Response } from 'express';
import { z } from 'zod';
import type { SchedulerConfig } from '../config/schema';
import { db } from '../db';
import { jobIdempotency, jobType } from '../db/schema';
import { getBoss } from '../queue/boss';
import { clearExistingJob } from '../services/job-idempotency.service';

const OneOffJobItemSchema = z.object({
  idempotencyKey: z.string().min(1),
  queue: z.string().min(1),
  payload: z.record(z.string(), z.unknown()).optional(),
  // ISO-8601 datetime with timezone (e.g. "2026-03-23T14:30:00Z" or "...-04:00")
  runAt: z.string().datetime({ offset: true }).optional(),
});

const OneOffBodySchema = z.array(OneOffJobItemSchema).min(1);

export function registerOneOffJob(config: SchedulerConfig) {
  return async (req: Request, res: Response) => {
    const parse = OneOffBodySchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({
        error: 'Invalid body',
        details: parse.error.issues.map((issue) => issue.message),
      });
      return;
    }

    const items = parse.data;

    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      if (!(item.queue in config.queues)) {
        res.status(400).json({
          error: 'Unknown queue',
          queue: item.queue,
          index: i,
        });
        return;
      }
    }

    const boss = getBoss();
    if (!boss) {
      res.status(503).json({ error: 'Service unavailable' });
      return;
    }

    const jobs: { jobId: string }[] = [];

    for (let i = 0; i < items.length; i++) {
      const { idempotencyKey, queue, payload, runAt } = items[i]!;

      const existing = await db.query.jobIdempotency.findFirst({
        where: eq(jobIdempotency.idempotencyKey, idempotencyKey),
      });
      if (existing) {
        await clearExistingJob(existing);
      }

      const requestedRunAt = runAt ? new Date(runAt) : null;
      const shouldDelay =
        requestedRunAt !== null && requestedRunAt.getTime() > Date.now();

      let jobId: string | null | undefined;
      if (shouldDelay) {
        jobId = await boss.sendAfter(
          queue,
          { payload: payload ?? {} },
          null,
          requestedRunAt!,
        );
      } else {
        jobId = await boss.send(queue, { payload: payload ?? {} });
      }
      if (!jobId) {
        res.status(500).json({
          error: 'Failed to enqueue job',
          index: i,
        });
        return;
      }

      await db.insert(jobIdempotency).values({
        idempotencyKey,
        jobType: jobType.ONE_OFF,
        pgBossJobId: jobId,
        queue,
      });

      jobs.push({ jobId });
    }

    res.status(202).json({ jobs });
  };
}
