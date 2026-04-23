import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SchedulerConfig } from '../../src/config/schema';
import { registerOneOffJob } from '../../src/controllers/one-off-job.controller';
import { db } from '../../src/db';
import { getBoss } from '../../src/queue/boss';
import * as jobIdempotencyService from '../../src/services/job-idempotency.service';

vi.mock('../../src/queue/boss', () => ({ getBoss: vi.fn() }));
vi.mock('../../src/db', () => ({
  db: {
    query: {
      jobIdempotency: { findFirst: vi.fn() },
    },
    insert: vi.fn(),
  },
}));

const config: SchedulerConfig = {
  queues: {
    myqueue: {
      endpoint: 'https://example.com/job',
      method: 'POST',
      signature_secret: 'secret',
    },
  },
  cron_jobs: [],
};

function mockReq(body: unknown): Request {
  return { body } as Request;
}

function mockRes(): Response {
  const res = {} as Response;
  res.status = vi.fn().mockReturnThis();
  res.json = vi.fn().mockReturnThis();
  return res;
}

describe('registerOneOffJob', () => {
  const handler = registerOneOffJob(config);

  let mockSend: ReturnType<typeof vi.fn>;
  let mockSendAfter: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSend = vi.fn().mockResolvedValue('job-id-123');
    mockSendAfter = vi.fn().mockResolvedValue('job-id-delayed');
    vi.mocked(getBoss).mockReturnValue({
      send: mockSend,
      sendAfter: mockSendAfter,
    } as unknown as ReturnType<typeof getBoss>);
    vi.mocked(db.query.jobIdempotency.findFirst).mockResolvedValue(undefined);
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    } as unknown as ReturnType<typeof db.insert>);
    vi.spyOn(jobIdempotencyService, 'clearExistingJob').mockResolvedValue();
  });

  it('returns 202 and jobs when body is a valid array of one job', async () => {
    const req = mockReq([
      {
        idempotencyKey: 'key-1',
        queue: 'myqueue',
        payload: { foo: 'bar' },
      },
    ]);
    const res = mockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith({
      jobs: [{ jobId: 'job-id-123' }],
    });
    expect(mockSend).toHaveBeenCalledWith('myqueue', {
      payload: { foo: 'bar' },
    });
    expect(db.insert).toHaveBeenCalled();
  });

  it('uses sendAfter when runAt is in the future', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(
      new Date('2026-01-01T00:00:00.000Z').getTime(),
    );
    const req = mockReq([
      {
        idempotencyKey: 'key-1',
        queue: 'myqueue',
        payload: { foo: 'bar' },
        runAt: '2026-01-01T00:00:10.000Z',
      },
    ]);
    const res = mockRes();

    await handler(req, res);

    expect(mockSendAfter).toHaveBeenCalledWith(
      'myqueue',
      { payload: { foo: 'bar' } },
      null,
      new Date('2026-01-01T00:00:10.000Z'),
    );
    expect(mockSend).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith({
      jobs: [{ jobId: 'job-id-delayed' }],
    });
  });

  it('uses send when runAt is in the past', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(
      new Date('2026-01-01T00:00:20.000Z').getTime(),
    );
    const req = mockReq([
      {
        idempotencyKey: 'key-1',
        queue: 'myqueue',
        payload: { foo: 'bar' },
        runAt: '2026-01-01T00:00:10.000Z',
      },
    ]);
    const res = mockRes();

    await handler(req, res);

    expect(mockSend).toHaveBeenCalledWith('myqueue', {
      payload: { foo: 'bar' },
    });
    expect(mockSendAfter).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(202);
  });

  it('returns 202 with multiple jobs in order', async () => {
    mockSend.mockResolvedValueOnce('job-a').mockResolvedValueOnce('job-b');
    const req = mockReq([
      { idempotencyKey: 'k1', queue: 'myqueue', payload: {} },
      { idempotencyKey: 'k2', queue: 'myqueue' },
    ]);
    const res = mockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith({
      jobs: [{ jobId: 'job-a' }, { jobId: 'job-b' }],
    });
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it('returns 400 when body is not a non-empty array', async () => {
    const req = mockReq({
      idempotencyKey: '',
      queue: 'myqueue',
    });
    const res = mockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Invalid body' }),
    );
  });

  it('returns 400 for empty array', async () => {
    const req = mockReq([]);
    const res = mockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 for unknown queue with index', async () => {
    const req = mockReq([
      {
        idempotencyKey: 'key-1',
        queue: 'unknown-queue',
      },
    ]);
    const res = mockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Unknown queue',
      queue: 'unknown-queue',
      index: 0,
    });
  });

  it('returns 503 when boss is null', async () => {
    vi.mocked(getBoss).mockReturnValue(null);
    const req = mockReq([{ idempotencyKey: 'key-1', queue: 'myqueue' }]);
    const res = mockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Service unavailable',
    });
  });

  it('calls clearExistingJob then sends new job when idempotency row exists', async () => {
    const existing = {
      idempotencyKey: 'key-1',
      pgBossJobId: 'old-job',
      queue: 'myqueue',
    };
    vi.mocked(db.query.jobIdempotency.findFirst).mockResolvedValue(
      existing as never,
    );
    const req = mockReq([{ idempotencyKey: 'key-1', queue: 'myqueue' }]);
    const res = mockRes();

    await handler(req, res);

    expect(jobIdempotencyService.clearExistingJob).toHaveBeenCalledWith(
      existing,
    );
    expect(res.status).toHaveBeenCalledWith(202);
  });

  it('returns 500 when boss.send returns null', async () => {
    vi.mocked(getBoss).mockReturnValue({
      send: vi.fn().mockResolvedValue(null),
    } as unknown as ReturnType<typeof getBoss>);
    const req = mockReq([{ idempotencyKey: 'key-1', queue: 'myqueue' }]);
    const res = mockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Failed to enqueue job',
      index: 0,
    });
  });
});
