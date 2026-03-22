import { createApp } from './app';
import { loadSchedulerConfigSegments, mergeQueuesForApi } from './config/load';
import { runMigrations } from './db/migrate';
import env from './env';
import { startBoss, stopBoss } from './queue/boss';
import { logger } from './utils/logger';

async function main() {
  await runMigrations();

  const segments = loadSchedulerConfigSegments();
  const configs = segments.map((s) => s.config);

  await startBoss(configs);

  const app = createApp(mergeQueuesForApi(configs));

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
