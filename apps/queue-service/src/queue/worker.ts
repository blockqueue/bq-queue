import type { QueueConfig, SchedulerConfig } from '../config/schema';
import env from '../env';
import { createSignature } from '../utils/createSignature';
import { logger } from '../utils/logger';
import type { PgBossInstance } from './boss';

const REQUEST_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes

async function runOneJob(
  queueName: string,
  queueConfig: QueueConfig,
  job: { id: string; name: string; data: Record<string, unknown> },
  onDynamicJobComplete?: (idempotencyKey: string) => Promise<void>,
): Promise<void> {
  const payload =
    (job.data?.payload as Record<string, unknown>) ?? job.data ?? {};
  const body = JSON.stringify(
    typeof payload === 'object' && payload !== null
      ? { timestamp: Math.floor(Date.now() / 1000), data: payload }
      : payload,
  );
  const signature = createSignature({
    payload: body,
    secret: queueConfig.signature_secret,
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const response = await fetch(queueConfig.endpoint, {
    method: queueConfig.method ?? 'POST',
    headers: {
      'Content-Type': 'application/json',
      [env.SIGNATURE_HEADER]: signature,
    },
    body,
    signal: controller.signal,
  });

  clearTimeout(timeoutId);

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const waitSeconds = queueConfig.wait_interval_after_success_seconds;
  if (waitSeconds != null && waitSeconds > 0) {
    await new Promise((r) => setTimeout(r, waitSeconds * 1000));
  }
  const idempotencyKey = job.data?.idempotencyKey as string | undefined;
  if (idempotencyKey && onDynamicJobComplete) {
    await onDynamicJobComplete(idempotencyKey).catch((err) =>
      logger.error(
        { err, idempotencyKey },
        'Failed to cleanup idempotency record after dynamic job success',
      ),
    );
  }
}

export function createWorkerHandler(
  boss: PgBossInstance,
  queueName: string,
  queueConfig: QueueConfig,
  _globalConfig: SchedulerConfig['global'],
  onDynamicJobComplete?: (idempotencyKey: string) => Promise<void>,
) {
  return async (
    jobs: Array<{ id: string; name: string; data: Record<string, unknown> }>,
  ) => {
    const results = await Promise.allSettled(
      jobs.map((job) =>
        runOneJob(queueName, queueConfig, job, onDynamicJobComplete),
      ),
    );
    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];
      const result = results[i];
      if (!job || result === undefined) continue;
      if (result.status === 'fulfilled') {
        await boss.complete(queueName, job.id);
      } else {
        logger.warn(
          {
            err: (result as PromiseRejectedResult).reason,
            jobId: job.id,
            queue: queueName,
          },
          'Job request failed, will retry',
        );
        await boss.fail(queueName, job.id);
      }
    }
  };
}

export function registerWorkers(
  boss: PgBossInstance,
  config: SchedulerConfig,
  onDynamicJobComplete?: (idempotencyKey: string) => Promise<void>,
): void {
  const global = config.global ?? {};
  for (const [queueName, queueConfig] of Object.entries(config.queues)) {
    const concurrency =
      queueConfig.max_concurrent_jobs ??
      global.default_queue_concurrency ??
      global.max_concurrent_jobs ??
      1;
    const handler = createWorkerHandler(
      boss,
      queueName,
      queueConfig,
      global,
      onDynamicJobComplete,
    );
    boss.work(queueName, { batchSize: Math.max(1, concurrency) }, handler);
    logger.info(
      { queue: queueName, batchSize: concurrency },
      'Worker registered',
    );
  }
}
