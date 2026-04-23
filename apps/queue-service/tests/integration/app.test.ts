import type { Server } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app';
import type { SchedulerConfig } from '../../src/config/schema';
import env from '../../src/env';
import { getBoss } from '../../src/queue/boss';
import { createSignature } from '../../src/utils/createSignature';

vi.mock('../../src/queue/boss', () => ({ getBoss: vi.fn() }));
vi.mock('../../src/db', () => ({
  db: {
    query: {
      jobIdempotency: { findFirst: vi.fn().mockResolvedValue(undefined) },
    },
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

const config: SchedulerConfig = {
  queues: {
    testqueue: {
      endpoint: 'https://example.com/job',
      method: 'POST',
      signature_secret: 'secret',
    },
  },
  cron_jobs: [],
};

describe('Integration: health and API wiring', () => {
  let server: Server;

  afterEach(() => {
    if (server) server.close();
  });

  it('GET /api/health returns 200 and { ok: true } when boss is set', async () => {
    vi.mocked(getBoss).mockReturnValue({} as ReturnType<typeof getBoss>);
    const app = createApp(config);
    server = app.listen(0);
    const port = (server.address() as { port: number }).port;
    const res = await fetch(`http://127.0.0.1:${port}/api/health`);
    const data = (await res.json()) as { ok: boolean };
    expect(res.status).toBe(200);
    expect(data).toEqual({ ok: true });
  });

  it('GET /api/health returns 503 and { ok: false } when boss is null', async () => {
    vi.mocked(getBoss).mockReturnValue(null);
    const app = createApp(config);
    server = app.listen(0);
    const port = (server.address() as { port: number }).port;
    const res = await fetch(`http://127.0.0.1:${port}/api/health`);
    const data = (await res.json()) as { ok: boolean };
    expect(res.status).toBe(503);
    expect(data).toEqual({ ok: false });
  });

  it('POST /api/jobs/one-off with valid signature returns 202 when boss is available', async () => {
    const mockSend = vi.fn().mockResolvedValue('job-123');
    vi.mocked(getBoss).mockReturnValue({
      send: mockSend,
    } as unknown as ReturnType<typeof getBoss>);
    const app = createApp(config);
    server = app.listen(0);
    const port = (server.address() as { port: number }).port;

    const body = JSON.stringify([
      {
        idempotencyKey: 'key-1',
        queue: 'testqueue',
        payload: { x: 1 },
      },
    ]);
    const signature = createSignature({
      payload: body,
      secret: env.REQUEST_SIGNING_SECRET,
    });

    const res = await fetch(`http://127.0.0.1:${port}/api/jobs/one-off`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [env.SIGNATURE_HEADER]: signature,
      },
      body,
    });
    const data = (await res.json()) as { jobs?: { jobId: string }[] };
    expect(res.status).toBe(202);
    expect(data).toEqual({ jobs: [{ jobId: 'job-123' }] });
    expect(mockSend).toHaveBeenCalledWith(
      'testqueue',
      expect.objectContaining({ payload: { x: 1 } }),
    );
  });
});
