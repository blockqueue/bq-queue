import { eq } from 'drizzle-orm';
import { Request, Response } from 'express';
import { z } from 'zod';
import type { SchedulerConfig } from '../config/schema';
import { db } from '../db';
import { jobIdempotency, jobType } from '../db/schema';
import { getBoss, getNextCronRun } from '../queue/boss';
import { clearExistingJob } from '../services/job-idempotency.service';

const ScheduleJobItemSchema = z.object({
  idempotencyKey: z.string().min(1),
  queue: z.string().min(1),
  schedule: z.string().min(1),
  timezone: z.string().optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
});

const ScheduleBodySchema = z.array(ScheduleJobItemSchema).min(1);

export function registerScheduleJob(config: SchedulerConfig) {
  return async (req: Request, res: Response) => {
    const parse = ScheduleBodySchema.safeParse(req.body);
    if (!parse.success) {
      res
        .status(400)
        .json({ error: 'Invalid body', details: parse.error.flatten() });
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

    const nextRuns: Date[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      const timezone = item.timezone ?? 'UTC';
      try {
        nextRuns.push(getNextCronRun(item.schedule, timezone));
      } catch {
        res.status(400).json({
          error: 'Invalid cron expression',
          schedule: item.schedule,
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

    const jobs: { id: string }[] = [];

    for (let i = 0; i < items.length; i++) {
      const { idempotencyKey, queue, payload } = items[i]!;
      const nextRun = nextRuns[i]!;

      const existingSchedule = await db.query.jobIdempotency.findFirst({
        where: eq(jobIdempotency.idempotencyKey, idempotencyKey),
      });
      if (existingSchedule) {
        await clearExistingJob(existingSchedule);
      }

      const jobPayload = { ...(payload ?? {}), idempotencyKey };
      const jobId = await boss.send(queue, jobPayload, {
        startAfter: nextRun,
      });
      if (!jobId) {
        res.status(500).json({
          error: 'Failed to schedule job',
          index: i,
        });
        return;
      }

      await db.insert(jobIdempotency).values({
        idempotencyKey,
        jobType: jobType.DYNAMIC,
        pgBossJobId: jobId,
        queue,
      });

      jobs.push({ id: idempotencyKey });
    }

    res.status(201).json({ jobs });
  };
}
