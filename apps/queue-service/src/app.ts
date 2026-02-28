import express from 'express';
import type { SchedulerConfig } from './config/schema';
import { deleteJob } from './controllers/delete.controller';
import { registerOneOffJob } from './controllers/one-off-job.controller';
import { registerScheduleJob } from './controllers/schedule-job.controller';
import { verifyRequestSignature } from './middlewares/verifyRequestSignature';
import { getBoss } from './queue/boss';

export function createApp(config: SchedulerConfig): express.Express {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    const boss = getBoss();
    res.status(boss ? 200 : 503).json({ ok: !!boss });
  });

  const rawJson = express.raw({ type: 'application/json' });
  const verify = verifyRequestSignature();
  app.post('/api/jobs/one-off', rawJson, verify, registerOneOffJob(config));
  app.post('/api/jobs/schedule', rawJson, verify, registerScheduleJob(config));
  app.post('/api/jobs/delete', rawJson, verify, deleteJob());

  return app;
}
