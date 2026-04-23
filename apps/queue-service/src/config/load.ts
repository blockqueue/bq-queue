import { readdirSync, readFileSync, statSync } from 'fs';
import yaml from 'js-yaml';
import { join, resolve } from 'path';
import env from '../env';
import { logger } from '../utils/logger';
import {
  SchedulerConfigSchema,
  type QueueConfig,
  type SchedulerConfig,
} from './schema';
import { substituteEnvDeep } from './substituteEnv';

const YAML_EXT = /\.ya?ml$/i;

function isYamlFilename(name: string): boolean {
  return YAML_EXT.test(name);
}

export type SchedulerConfigSegment = {
  sourceFile: string;
  config: SchedulerConfig;
};

function parseSchedulerConfigString(raw: string): SchedulerConfig {
  const parsed = yaml.load(raw) as unknown;
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid scheduler config: expected an object');
  }
  const withEnv = substituteEnvDeep(parsed) as Parameters<
    typeof SchedulerConfigSchema.parse
  >[0];
  const config = SchedulerConfigSchema.parse(withEnv);

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

/**
 * Loads all `.yml` / `.yaml` files from `SCHEDULER_CONFIG_DIR` (must be a directory).
 * Per-file parse failures are logged and skipped. Duplicate queue names or cron job
 * names across successfully parsed files cause the later file (sorted by name) to be skipped.
 */
export function loadSchedulerConfigSegments(): SchedulerConfigSegment[] {
  const dir = resolve(env.SCHEDULER_CONFIG_DIR);
  let st: ReturnType<typeof statSync>;
  try {
    st = statSync(dir);
  } catch (err) {
    logger.error({ err, dir }, 'SCHEDULER_CONFIG_DIR is not accessible');
    throw err;
  }
  if (!st.isDirectory()) {
    throw new Error(`SCHEDULER_CONFIG_DIR must be a directory: ${dir}`);
  }

  let names: string[];
  try {
    names = readdirSync(dir);
  } catch (err) {
    logger.error({ err, dir }, 'Cannot read SCHEDULER_CONFIG_DIR');
    throw err;
  }

  const yamlFiles = names
    .filter(isYamlFilename)
    .sort((a, b) => a.localeCompare(b));

  if (yamlFiles.length === 0) {
    logger.warn({ dir }, 'No .yml or .yaml files in SCHEDULER_CONFIG_DIR');
    return [];
  }

  type Loaded = { sourceFile: string; config: SchedulerConfig };
  const loaded: Loaded[] = [];

  for (const name of yamlFiles) {
    const filePath = join(dir, name);
    try {
      const raw = readFileSync(filePath, 'utf-8');
      const config = parseSchedulerConfigString(raw);
      loaded.push({ sourceFile: name, config });
    } catch (err) {
      logger.error(
        { err, path: filePath },
        'Failed to load scheduler config file',
      );
    }
  }

  const accepted: SchedulerConfigSegment[] = [];
  const takenQueues = new Set<string>();
  const takenCronNames = new Set<string>();

  for (const item of loaded) {
    const { config, sourceFile } = item;
    const queueKeys = Object.keys(config.queues);
    const dupQueues = queueKeys.filter((q) => takenQueues.has(q));
    const crons = config.cron_jobs ?? [];
    const dupCronNames = crons.filter((c) => takenCronNames.has(c.name));

    if (dupQueues.length > 0 || dupCronNames.length > 0) {
      logger.error(
        {
          sourceFile,
          duplicateQueues: dupQueues,
          duplicateCronNames: dupCronNames.map((c) => c.name),
        },
        'Skipping scheduler config segment: duplicate queue or cron name vs earlier files',
      );
      continue;
    }

    queueKeys.forEach((q) => takenQueues.add(q));
    crons.forEach((c) => takenCronNames.add(c.name));
    accepted.push({ sourceFile, config });
  }

  if (accepted.length === 0 && yamlFiles.length > 0) {
    logger.warn(
      { dir },
      'No valid scheduler config segments (all files failed or were skipped)',
    );
  }

  return accepted;
}

/** Merged queues from all segments for API validation (one-off / schedule handlers). */
export function mergeQueuesForApi(configs: SchedulerConfig[]): SchedulerConfig {
  const queues: Record<string, QueueConfig> = {};
  for (const c of configs) {
    for (const [name, q] of Object.entries(c.queues)) {
      queues[name] = q;
    }
  }
  return {
    queues,
    cron_jobs: [],
  };
}
