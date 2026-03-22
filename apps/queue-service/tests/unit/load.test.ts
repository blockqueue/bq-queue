import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { logger } from '../../src/utils/logger';

vi.mock('../../src/env', () => ({
  default: {
    SCHEDULER_CONFIG_DIR: '/mock/config',
  },
}));

vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
  statSync: vi.fn(),
}));

vi.mock('../../src/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
  },
}));

import {
  loadSchedulerConfigSegments,
  mergeQueuesForApi,
} from '../../src/config/load';

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

const otherQueueYaml = `
queues:
  other:
    endpoint: https://other.example/hook
    signature_secret: other-secret
`;

describe('loadSchedulerConfigSegments', () => {
  const mockDir = '/mock/config';

  beforeEach(() => {
    vi.mocked(statSync).mockReturnValue({
      isDirectory: () => true,
    } as ReturnType<typeof statSync>);
    vi.mocked(readdirSync).mockReturnValue([]);
    vi.mocked(readFileSync).mockReturnValue(validYaml);
    vi.mocked(logger.warn).mockClear();
    vi.mocked(logger.error).mockClear();
  });

  it('loads and parses a valid YAML file', () => {
    vi.mocked(readdirSync).mockReturnValue(['a.yml']);
    vi.mocked(readFileSync).mockImplementation((p) => {
      if (p === join(mockDir, 'a.yml')) return validYaml;
      throw new Error(`unexpected path: ${p}`);
    });

    const segments = loadSchedulerConfigSegments();
    expect(segments).toHaveLength(1);
    expect(segments[0]!.sourceFile).toBe('a.yml');
    expect(segments[0]!.config.queues.myqueue?.endpoint).toBe(
      'https://example.com/webhook',
    );
    expect(segments[0]!.config.queues.myqueue?.method).toBe('POST');
    expect(segments[0]!.config.cron_jobs).toEqual([]);
  });

  it('returns empty array and warns when directory has no yaml files', () => {
    vi.mocked(readdirSync).mockReturnValue(['README.md', 'not-yaml.txt']);

    const segments = loadSchedulerConfigSegments();
    expect(segments).toEqual([]);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('throws when path is not a directory', () => {
    vi.mocked(statSync).mockReturnValue({
      isDirectory: () => false,
    } as ReturnType<typeof statSync>);

    expect(() => loadSchedulerConfigSegments()).toThrow(
      'SCHEDULER_CONFIG_DIR must be a directory',
    );
  });

  it('rethrows when stat fails', () => {
    vi.mocked(statSync).mockImplementation(() => {
      throw new Error('ENOENT');
    });

    expect(() => loadSchedulerConfigSegments()).toThrow('ENOENT');
  });

  it('logs and skips a file when YAML is not an object', () => {
    vi.mocked(readdirSync).mockReturnValue(['bad.yml', 'good.yml']);
    vi.mocked(readFileSync).mockImplementation((p) => {
      if (String(p).endsWith('bad.yml')) return 'just a string';
      if (String(p).endsWith('good.yml')) return validYaml;
      throw new Error(String(p));
    });

    const segments = loadSchedulerConfigSegments();
    expect(segments).toHaveLength(1);
    expect(segments[0]!.sourceFile).toBe('good.yml');
    expect(logger.error).toHaveBeenCalled();
  });

  it('substitutes env vars in config', () => {
    process.env.SIG_SECRET = 'substituted-secret';
    vi.mocked(readdirSync).mockReturnValue(['env.yml']);
    vi.mocked(readFileSync).mockReturnValue(yamlWithEnv);
    try {
      const segments = loadSchedulerConfigSegments();
      expect(segments[0]!.config.queues.myqueue?.signature_secret).toBe(
        'substituted-secret',
      );
    } finally {
      delete process.env.SIG_SECRET;
    }
  });

  it('logs and skips file when cron_jobs reference undefined queue', () => {
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
    vi.mocked(readdirSync).mockReturnValue(['bad.yml', 'ok.yml']);
    vi.mocked(readFileSync).mockImplementation((p) => {
      if (String(p).endsWith('bad.yml')) return badYaml;
      if (String(p).endsWith('ok.yml')) return validYaml;
      throw new Error(String(p));
    });

    const segments = loadSchedulerConfigSegments();
    expect(segments).toHaveLength(1);
    expect(segments[0]!.sourceFile).toBe('ok.yml');
    expect(logger.error).toHaveBeenCalled();
  });

  it('loads multiple files and merges names in order', () => {
    vi.mocked(readdirSync).mockReturnValue(['a.yml', 'b.yaml']);
    vi.mocked(readFileSync).mockImplementation((p) => {
      if (String(p).endsWith('a.yml')) return validYaml;
      if (String(p).endsWith('b.yaml')) return otherQueueYaml;
      throw new Error(String(p));
    });

    const segments = loadSchedulerConfigSegments();
    expect(segments).toHaveLength(2);
    expect(Object.keys(segments[0]!.config.queues)).toContain('myqueue');
    expect(Object.keys(segments[1]!.config.queues)).toContain('other');
  });

  it('skips later file when queue name duplicates an earlier file', () => {
    vi.mocked(readdirSync).mockReturnValue(['a.yml', 'b.yml']);
    vi.mocked(readFileSync).mockImplementation((p) => {
      if (String(p).endsWith('a.yml')) return validYaml;
      if (String(p).endsWith('b.yml')) return validYaml;
      throw new Error(String(p));
    });

    const segments = loadSchedulerConfigSegments();
    expect(segments).toHaveLength(1);
    expect(segments[0]!.sourceFile).toBe('a.yml');
    expect(logger.error).toHaveBeenCalled();
  });

  it('skips later file when cron name duplicates an earlier file', () => {
    const withCron = `
queues:
  q:
    endpoint: https://x.com
    signature_secret: s
cron_jobs:
  - name: shared-cron
    queue: q
    schedule: "0 * * * *"
`;
    vi.mocked(readdirSync).mockReturnValue(['a.yml', 'b.yml']);
    vi.mocked(readFileSync).mockImplementation((p) => {
      if (String(p).endsWith('a.yml')) return withCron;
      if (String(p).endsWith('b.yml')) return withCron;
      throw new Error(String(p));
    });

    const segments = loadSchedulerConfigSegments();
    expect(segments).toHaveLength(1);
    expect(logger.error).toHaveBeenCalled();
  });

  it('warns when every file fails or is skipped', () => {
    vi.mocked(readdirSync).mockReturnValue(['only-bad.yml']);
    vi.mocked(readFileSync).mockReturnValue('just a string');

    const segments = loadSchedulerConfigSegments();
    expect(segments).toHaveLength(0);
    expect(logger.warn).toHaveBeenCalled();
  });
});

describe('mergeQueuesForApi', () => {
  it('merges queue maps from multiple configs', () => {
    const merged = mergeQueuesForApi([
      {
        queues: {
          a: {
            endpoint: 'https://a.com',
            signature_secret: 's',
            method: 'POST',
          },
        },
        cron_jobs: [],
      },
      {
        queues: {
          b: {
            endpoint: 'https://b.com',
            signature_secret: 't',
            method: 'POST',
          },
        },
        cron_jobs: [],
      },
    ]);
    expect(Object.keys(merged.queues).sort()).toEqual(['a', 'b']);
    expect(merged.cron_jobs).toEqual([]);
  });
});
