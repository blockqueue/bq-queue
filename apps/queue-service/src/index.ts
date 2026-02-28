import express from 'express';
import { loadSchedulerConfig } from './config/load';
import { deleteJob } from './controllers/delete.controller';
import { registerOneOffJob } from './controllers/one-off-job.controller';
import { registerScheduleJob } from './controllers/schedule-job.controller';
import env from './env';
import { verifyRequestSignature } from './middlewares/verifyRequestSignature';
import { getBoss, startBoss, stopBoss } from './queue/boss';
import { logger } from './utils/logger';

const app = express();

async function main() {
  const config = loadSchedulerConfig();

  await startBoss(config);

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

  const server = app.listen(Number(env.PORT), () => {
    logger.info({ port: env.PORT }, 'Queue Service is running');
  });

  const shutdown = async () => {
    await stopBoss();
    server.close();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  logger.fatal({ err }, 'Failed to start');
  process.exit(1);
});
