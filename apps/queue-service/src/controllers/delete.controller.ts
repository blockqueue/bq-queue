import { eq } from 'drizzle-orm';
import { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { jobIdempotency } from '../db/schema';
import { clearExistingJob } from '../services/job-idempotency.service';

const DeleteBodySchema = z.object({
  idempotencyKey: z.string().uuid(),
});

export function deleteJob() {
  return async (req: Request, res: Response) => {
    const parse = DeleteBodySchema.safeParse(req.body);
    if (!parse.success) {
      res
        .status(400)
        .json({ error: 'Invalid body', details: parse.error.flatten() });
      return;
    }
    const { idempotencyKey } = parse.data;

    const existing = await db.query.jobIdempotency.findFirst({
      where: eq(jobIdempotency.idempotencyKey, idempotencyKey),
    });
    if (!existing) {
      res.status(404).json({ error: 'Job not found', idempotencyKey });
      return;
    }

    await clearExistingJob(existing);
    res.status(200).json({ deleted: true });
  };
}
