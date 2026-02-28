import { readFileSync, statSync } from 'fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadSchedulerConfig } from '../../src/config/load';

vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  statSync: vi.fn(() => ({ isDirectory: () => false })),
}));

const validYaml = `
queues:
  myqueue:
    endpoint: https://example.com/webhook
    signature_secret: my-secret
`;

const yamlWithEnv = `
queues:
  myqueue:
    endpoint: https://example.com
    signature_secret: \${SIG_SECRET}
`;

describe('loadSchedulerConfig', () => {
  beforeEach(() => {
    vi.mocked(readFileSync).mockReturnValue(validYaml);
    vi.mocked(statSync).mockReturnValue({
      isDirectory: () => false,
    } as ReturnType<typeof statSync>);
  });

  it('loads and parses valid YAML config', () => {
    const config = loadSchedulerConfig();
    const queue = config.queues.myqueue;
    expect(queue).toBeDefined();
    expect(queue!.endpoint).toBe('https://example.com/webhook');
    expect(queue!.signature_secret).toBe('my-secret');
    expect(queue!.method).toBe('POST');
    expect(config.cron_jobs).toEqual([]);
  });

  it('throws when YAML is not an object', () => {
    vi.mocked(readFileSync).mockReturnValue('just a string');
    expect(() => loadSchedulerConfig()).toThrow(
      'Invalid scheduler config: expected an object',
    );
  });

  it('substitutes env vars in config', () => {
    process.env.SIG_SECRET = 'substituted-secret';
    vi.mocked(readFileSync).mockReturnValue(yamlWithEnv);
    try {
      const config = loadSchedulerConfig();
      expect(config.queues.myqueue?.signature_secret).toBe(
        'substituted-secret',
      );
    } finally {
      delete process.env.SIG_SECRET;
    }
  });

  it('throws when cron_jobs reference undefined queue', () => {
    const badYaml = `
queues:
  only_queue:
    endpoint: https://x.com
    signature_secret: s
cron_jobs:
  - name: bad
    queue: not_defined
    schedule: "0 * * * *"
`;
    vi.mocked(readFileSync).mockReturnValue(badYaml);
    expect(() => loadSchedulerConfig()).toThrow(
      'cron_jobs[].queue "not_defined" is not defined in queues',
    );
  });
});
