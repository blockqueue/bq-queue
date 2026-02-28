import { describe, expect, it } from 'vitest';
import { getNextCronRun } from '../../src/queue/boss';

describe('getNextCronRun', () => {
  it('returns a Date in the future for valid cron expression', () => {
    const next = getNextCronRun('0 * * * *', 'UTC');
    expect(next).toBeInstanceOf(Date);
    expect(next.getTime()).toBeGreaterThan(Date.now());
  });

  it('respects timezone parameter', () => {
    const nextUtc = getNextCronRun('0 12 * * *', 'UTC');
    const nextLondon = getNextCronRun('0 12 * * *', 'Europe/London');
    expect(nextUtc).toBeInstanceOf(Date);
    expect(nextLondon).toBeInstanceOf(Date);
    expect(nextUtc.getTime()).toBeGreaterThan(Date.now());
    expect(nextLondon.getTime()).toBeGreaterThan(Date.now());
  });

  it('throws for invalid cron expression', () => {
    expect(() => getNextCronRun('not-a-cron-expression', 'UTC')).toThrow();
  });
});
