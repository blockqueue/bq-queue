import { describe, expect, it } from 'vitest';
import {
  CleanupConfigSchema,
  CronJobConfigSchema,
  GlobalConfigSchema,
  QueueConfigSchema,
  SchedulerConfigSchema,
} from '../../src/config/schema';

describe('SchedulerConfigSchema', () => {
  const validMinimal = {
    queues: {
      q1: {
        endpoint: 'https://example.com/job',
        signature_secret: 'secret',
      },
    },
  };

  it('parses valid minimal config', () => {
    const result = SchedulerConfigSchema.parse(validMinimal);
    const q1 = result.queues.q1;
    expect(q1).toBeDefined();
    expect(q1!.endpoint).toBe('https://example.com/job');
    expect(q1!.signature_secret).toBe('secret');
    expect(q1!.method).toBe('POST');
    expect(result.cron_jobs).toEqual([]);
  });

  it('rejects missing queues', () => {
    expect(() => SchedulerConfigSchema.parse({ global: {} })).toThrow();
  });

  it('rejects invalid queue config (missing endpoint)', () => {
    expect(() =>
      SchedulerConfigSchema.parse({
        queues: {
          q1: { signature_secret: 'x' },
        },
      }),
    ).toThrow();
  });

  it('accepts optional global, cleanup, and cron_jobs', () => {
    const full = {
      global: { retryLimit: 3 },
      queues: {
        q1: { endpoint: 'https://a.com', signature_secret: 's' },
      },
      cron_jobs: [{ name: 'daily', queue: 'q1', schedule: '0 0 * * *' }],
      cleanup: { retention_days: 7 },
    };
    const result = SchedulerConfigSchema.parse(full);
    expect(result.global?.retryLimit).toBe(3);
    expect(result.cron_jobs).toHaveLength(1);
    expect(result.cron_jobs?.[0]?.timezone).toBe('UTC');
    expect(result.cleanup?.retention_days).toBe(7);
  });
});

describe('QueueConfigSchema', () => {
  it('requires endpoint and signature_secret', () => {
    const result = QueueConfigSchema.parse({
      endpoint: 'https://x.com',
      signature_secret: 'sec',
    });
    expect(result.method).toBe('POST');
  });

  it('defaults method to POST', () => {
    const result = QueueConfigSchema.parse({
      endpoint: 'https://x.com',
      signature_secret: 's',
    });
    expect(result.method).toBe('POST');
  });

  it('accepts optional retry and concurrency options', () => {
    const result = QueueConfigSchema.parse({
      endpoint: 'https://x.com',
      signature_secret: 's',
      method: 'POST',
      retryLimit: 5,
      retryDelay: 60,
      max_concurrent_jobs: 2,
    });
    expect(result.retryLimit).toBe(5);
    expect(result.retryDelay).toBe(60);
    expect(result.max_concurrent_jobs).toBe(2);
  });
});

describe('CronJobConfigSchema', () => {
  it('requires name, queue, schedule', () => {
    const result = CronJobConfigSchema.parse({
      name: 'job1',
      queue: 'q1',
      schedule: '0 * * * *',
    });
    expect(result.timezone).toBe('UTC');
  });

  it('defaults timezone to UTC', () => {
    const result = CronJobConfigSchema.parse({
      name: 'n',
      queue: 'q',
      schedule: '0 0 * * *',
    });
    expect(result.timezone).toBe('UTC');
  });

  it('accepts optional payload and timezone', () => {
    const result = CronJobConfigSchema.parse({
      name: 'n',
      queue: 'q',
      schedule: '0 0 * * *',
      timezone: 'Europe/London',
      payload: { key: 'value' },
    });
    expect(result.timezone).toBe('Europe/London');
    expect(result.payload).toEqual({ key: 'value' });
  });
});

describe('CleanupConfigSchema', () => {
  it('accepts optional numeric fields', () => {
    const result = CleanupConfigSchema.parse({
      maintenance_interval_seconds: 120,
      retention_days: 14,
      warning_retention_days: 30,
    });
    expect(result.maintenance_interval_seconds).toBe(120);
    expect(result.retention_days).toBe(14);
  });

  it('accepts empty object', () => {
    expect(CleanupConfigSchema.parse({})).toEqual({});
  });
});

describe('GlobalConfigSchema', () => {
  it('accepts optional fields', () => {
    const result = GlobalConfigSchema.parse({
      retryLimit: 3,
      retryBackoff: true,
    });
    expect(result.retryLimit).toBe(3);
    expect(result.retryBackoff).toBe(true);
  });
});
