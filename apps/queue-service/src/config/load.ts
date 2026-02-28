import { readFileSync, statSync } from 'fs';
import yaml from 'js-yaml';
import { join, resolve } from 'path';
import env from '../env';
import { logger } from '../utils/logger';
import { SchedulerConfigSchema, type SchedulerConfig } from './schema';
import { substituteEnvDeep } from './substituteEnv';

const DEFAULT_CONFIG_FILENAME = 'config.yml';

export function loadSchedulerConfig(): SchedulerConfig {
  const configPath = env.SCHEDULER_CONFIG_PATH;
  let path =
    configPath ?? resolve(process.cwd(), 'config', DEFAULT_CONFIG_FILENAME);
  path = resolve(path);
  try {
    if (statSync(path).isDirectory()) {
      path = join(path, DEFAULT_CONFIG_FILENAME);
    }
  } catch {
    // path may not exist yet; readFileSync will throw a clearer error
  }
  logger.info({ path }, 'Loading scheduler config');
  const raw = readFileSync(path, 'utf-8');
  const parsed = yaml.load(raw) as unknown;
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid scheduler config: expected an object');
  }
  const withEnv = substituteEnvDeep(parsed) as Parameters<
    typeof SchedulerConfigSchema.parse
  >[0];
  const config = SchedulerConfigSchema.parse(withEnv);

  // Validate cron_jobs reference only defined queues
  const queueNames = new Set(Object.keys(config.queues));
  for (const job of config.cron_jobs ?? []) {
    if (!queueNames.has(job.queue)) {
      throw new Error(
        `cron_jobs[].queue "${job.queue}" is not defined in queues`,
      );
    }
  }

  return config;
}
