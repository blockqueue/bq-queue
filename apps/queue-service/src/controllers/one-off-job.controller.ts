import { eq } from 'drizzle-orm';
import { Request, Response } from 'express';
import { z } from 'zod';
import type { SchedulerConfig } from '../config/schema';
import { db } from '../db';
import { jobIdempotency, jobType } from '../db/schema';
import { getBoss } from '../queue/boss';
import { clearExistingJob } from '../services/job-idempotency.service';

const OneOffBodySchema = z.object({
  idempotencyKey: z.string().min(1),
  queue: z.string().min(1),
  payload: z.record(z.string(), z.unknown()).optional(),
});

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

    const { idempotencyKey, queue, payload } = parse.data;
    if (!(queue in config.queues)) {
      res.status(400).json({ error: 'Unknown queue', queue });
      return;
    }

    const boss = getBoss();
    if (!boss) {
      res.status(503).json({ error: 'Service unavailable' });
      return;
    }

    const existing = await db.query.jobIdempotency.findFirst({
      where: eq(jobIdempotency.idempotencyKey, idempotencyKey),
    });
    if (existing) {
      await clearExistingJob(existing);
    }

    const jobId = await boss.send(queue, { payload: payload ?? {} });
    if (!jobId) {
      res.status(500).json({ error: 'Failed to enqueue job' });
      return;
    }

    await db.insert(jobIdempotency).values({
      idempotencyKey,
      jobType: jobType.ONE_OFF,
      pgBossJobId: jobId,
      queue,
    });
    res.status(202).json({ jobId });
  };
}
