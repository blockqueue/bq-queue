import { createApp } from './app';
import { loadSchedulerConfig } from './config/load';
import env from './env';
import { startBoss, stopBoss } from './queue/boss';
import { logger } from './utils/logger';

async function main() {
  const config = loadSchedulerConfig();

  await startBoss(config);

  const app = createApp(config);

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
