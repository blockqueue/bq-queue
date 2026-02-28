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

  beforeEach(() => {
    vi.clearAllMocks();
    mockSend = vi.fn().mockResolvedValue('job-id-123');
    vi.mocked(getBoss).mockReturnValue({
      send: mockSend,
    } as unknown as ReturnType<typeof getBoss>);
    vi.mocked(db.query.jobIdempotency.findFirst).mockResolvedValue(undefined);
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    } as unknown as ReturnType<typeof db.insert>);
    vi.spyOn(jobIdempotencyService, 'clearExistingJob').mockResolvedValue();
  });

  it('returns 202 and jobId when body is valid and queue exists', async () => {
    const req = mockReq({
      idempotencyKey: 'key-1',
      queue: 'myqueue',
      payload: { foo: 'bar' },
    });
    const res = mockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith({ jobId: 'job-id-123' });
    expect(mockSend).toHaveBeenCalledWith('myqueue', {
      payload: { foo: 'bar' },
    });
    expect(db.insert).toHaveBeenCalled();
  });

  it('returns 400 when body is invalid', async () => {
    const req = mockReq({ idempotencyKey: '', queue: 'myqueue' });
    const res = mockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Invalid body' }),
    );
  });

  it('returns 400 for unknown queue', async () => {
    const req = mockReq({
      idempotencyKey: 'key-1',
      queue: 'unknown-queue',
    });
    const res = mockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Unknown queue',
      queue: 'unknown-queue',
    });
  });

  it('returns 503 when boss is null', async () => {
    vi.mocked(getBoss).mockReturnValue(null);
    const req = mockReq({ idempotencyKey: 'key-1', queue: 'myqueue' });
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
    const req = mockReq({ idempotencyKey: 'key-1', queue: 'myqueue' });
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
    const req = mockReq({ idempotencyKey: 'key-1', queue: 'myqueue' });
    const res = mockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Failed to enqueue job',
    });
  });
});
