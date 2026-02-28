import cronParser from 'cron-parser';
import { eq } from 'drizzle-orm';
import type {
  ConstructorOptions as PgBossConstructorOptions,
  Queue as PgBossQueue,
} from 'pg-boss';
import { PgBoss } from 'pg-boss';
import type { SchedulerConfig } from '../config/schema';
import { db } from '../db';
import { jobIdempotency } from '../db/schema/index';
import env from '../env';
import { logger } from '../utils/logger';
import { registerWorkers } from './worker';

export type PgBossInstance = InstanceType<typeof PgBoss>;

const DEFAULT_MAINTENANCE_INTERVAL_SECONDS = 60;
const SECONDS_PER_DAY = 86400;
const DEFAULT_RETENTION_DAYS = 14; // pg-boss v12 default for queue retention
const DEFAULT_DELETE_AFTER_DAYS = 7;
const DEFAULT_WARNING_RETENTION_DAYS = 30;

function getPgBossOptions(config: SchedulerConfig): PgBossConstructorOptions {
  const c = config.cleanup ?? {};
  return {
    connectionString: env.POSTGRES_DATABASE_URL,
    maintenanceIntervalSeconds:
      c.maintenance_interval_seconds ?? DEFAULT_MAINTENANCE_INTERVAL_SECONDS,
    persistWarnings: true,
    warningRetentionDays:
      c.warning_retention_days ?? DEFAULT_WARNING_RETENTION_DAYS,
  };
}

let bossInstance: PgBossInstance | null = null;
export function getBoss(): PgBossInstance | null {
  return bossInstance;
}

async function onDynamicJobComplete(idempotencyKey: string): Promise<void> {
  await db
    .delete(jobIdempotency)
    .where(eq(jobIdempotency.idempotencyKey, idempotencyKey));
}

function getQueueOptions(
  name: string,
  queueConfig: SchedulerConfig['queues'][string],
  global: SchedulerConfig['global'],
  cleanup: SchedulerConfig['cleanup'],
): PgBossQueue {
  const c = cleanup ?? {};
  const retentionDays = c.retention_days ?? DEFAULT_RETENTION_DAYS;
  const deleteAfterDays = c.delete_after_days ?? DEFAULT_DELETE_AFTER_DAYS;
  const options: PgBossQueue = {
    name,
    retryLimit: queueConfig.retryLimit ?? global?.retryLimit,
    retryDelay: queueConfig.retryDelay ?? global?.retryDelay,
    retryBackoff: queueConfig.retryBackoff ?? global?.retryBackoff ?? true,
    retentionSeconds: retentionDays * SECONDS_PER_DAY,
    deleteAfterSeconds: deleteAfterDays * SECONDS_PER_DAY,
  };
  // pg-boss asserts expireInSeconds >= 1 when present; omit when unset or invalid
  const expire = queueConfig.expireInSeconds ?? global?.expireInSeconds;
  if (typeof expire === 'number' && expire >= 1) {
    options.expireInSeconds = expire;
  }
  return options;
}

export async function startBoss(
  config: SchedulerConfig,
): Promise<PgBossInstance> {
  const boss = new PgBoss(getPgBossOptions(config));
  bossInstance = boss;

  boss.on('error', (err: Error) => logger.error({ err }, 'pg-boss error'));

  await boss.start();

  const global = config.global ?? {};

  for (const [name, queueConfig] of Object.entries(config.queues)) {
    const options = getQueueOptions(name, queueConfig, global, config.cleanup);
    await boss.createQueue(name, options);
    logger.info({ queue: name }, 'Queue created');
  }

  const queueNames = new Set(Object.keys(config.queues));
  for (const cron of config.cron_jobs ?? []) {
    if (!queueNames.has(cron.queue)) {
      throw new Error(
        `cron_jobs[].queue "${cron.queue}" is not defined in queues. Define it in the queues section first.`,
      );
    }
    await boss.schedule(cron.queue, cron.schedule, cron.payload ?? {}, {
      tz: cron.timezone,
      key: cron.name,
    });
    logger.info(
      { name: cron.name, queue: cron.queue, schedule: cron.schedule },
      'Static cron scheduled',
    );
  }

  registerWorkers(boss, config, onDynamicJobComplete);

  return boss;
}

export async function stopBoss(): Promise<void> {
  if (bossInstance) {
    await bossInstance.stop({ graceful: true });
    bossInstance = null;
    logger.info('pg-boss stopped');
  }
}

export function getNextCronRun(cronExpression: string, timezone: string): Date {
  const interval = cronParser.parseExpression(cronExpression, { tz: timezone });
  return interval.next().toDate();
}
