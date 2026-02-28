import { eq } from 'drizzle-orm';
import { Request, Response } from 'express';
import { z } from 'zod';
import type { SchedulerConfig } from '../config/schema';
import { db } from '../db';
import { jobIdempotency, jobType } from '../db/schema';
import { getBoss, getNextCronRun } from '../queue/boss';
import { clearExistingJob } from '../services/job-idempotency.service';

const ScheduleBodySchema = z.object({
  idempotencyKey: z.string().min(1),
  queue: z.string().min(1),
  schedule: z.string().min(1),
  timezone: z.string().optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
});

export function registerScheduleJob(config: SchedulerConfig) {
  return async (req: Request, res: Response) => {
    const parse = ScheduleBodySchema.safeParse(req.body);
    if (!parse.success) {
      res
        .status(400)
        .json({ error: 'Invalid body', details: parse.error.flatten() });
      return;
    }

    const {
      idempotencyKey,
      queue,
      schedule,
      timezone = 'UTC',
      payload,
    } = parse.data;

    if (!(queue in config.queues)) {
      res.status(400).json({ error: 'Unknown queue', queue });
      return;
    }

    const boss = getBoss();
    if (!boss) {
      res.status(503).json({ error: 'Service unavailable' });
      return;
    }

    const existingSchedule = await db.query.jobIdempotency.findFirst({
      where: eq(jobIdempotency.idempotencyKey, idempotencyKey),
    });
    if (existingSchedule) {
      await clearExistingJob(existingSchedule);
    }

    let nextRun: Date;
    try {
      nextRun = getNextCronRun(schedule, timezone);
    } catch {
      res.status(400).json({ error: 'Invalid cron expression', schedule });
      return;
    }

    const jobPayload = { ...(payload ?? {}), idempotencyKey };
    const jobId = await boss.send(queue, jobPayload, { startAfter: nextRun });
    if (!jobId) {
      res.status(500).json({ error: 'Failed to schedule job' });
      return;
    }

    await db.insert(jobIdempotency).values({
      idempotencyKey,
      jobType: jobType.DYNAMIC,
      pgBossJobId: jobId,
      queue,
    });

    res.status(201).json({ id: idempotencyKey });
  };
}
