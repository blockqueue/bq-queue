import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SchedulerConfig } from '../../src/config/schema';
import { registerScheduleJob } from '../../src/controllers/schedule-job.controller';
import { db } from '../../src/db';
import { getBoss, getNextCronRun } from '../../src/queue/boss';
import * as jobIdempotencyService from '../../src/services/job-idempotency.service';

vi.mock('../../src/queue/boss', () => ({
  getBoss: vi.fn(),
  getNextCronRun: vi.fn(),
}));
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

function mockReq(body: unknown): import('express').Request {
  return { body } as import('express').Request;
}

function mockRes(): import('express').Response {
  const res = {} as import('express').Response;
  res.status = vi.fn().mockReturnThis();
  res.json = vi.fn().mockReturnThis();
  return res;
}

describe('registerScheduleJob', () => {
  const handler = registerScheduleJob(config);
  let mockSend: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSend = vi.fn().mockResolvedValue('job-id-123');
    vi.mocked(getBoss).mockReturnValue({
      send: mockSend,
    } as unknown as ReturnType<typeof getBoss>);
    vi.mocked(getNextCronRun).mockReturnValue(new Date(Date.now() + 60000));
    vi.mocked(db.query.jobIdempotency.findFirst).mockResolvedValue(undefined);
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    } as unknown as ReturnType<typeof db.insert>);
    vi.spyOn(jobIdempotencyService, 'clearExistingJob').mockResolvedValue();
  });

  it('returns 201 and id when body is valid', async () => {
    const req = mockReq({
      idempotencyKey: 'key-1',
      queue: 'myqueue',
      schedule: '0 * * * *',
      payload: { x: 1 },
    });
    const res = mockRes();

    await handler(req, res);

    expect(getNextCronRun).toHaveBeenCalledWith('0 * * * *', 'UTC');
    expect(mockSend).toHaveBeenCalledWith(
      'myqueue',
      expect.objectContaining({ idempotencyKey: 'key-1', x: 1 }),
      expect.objectContaining({ startAfter: expect.any(Date) }),
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ id: 'key-1' });
  });

  it('returns 400 when body is invalid', async () => {
    const req = mockReq({ idempotencyKey: 'key-1', queue: 'myqueue' });
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
      queue: 'unknown',
      schedule: '0 * * * *',
    });
    const res = mockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Unknown queue',
      queue: 'unknown',
    });
  });

  it('returns 503 when boss is null', async () => {
    vi.mocked(getBoss).mockReturnValue(null);
    const req = mockReq({
      idempotencyKey: 'key-1',
      queue: 'myqueue',
      schedule: '0 * * * *',
    });
    const res = mockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Service unavailable',
    });
  });

  it('returns 400 for invalid cron expression', async () => {
    vi.mocked(getNextCronRun).mockImplementation(() => {
      throw new Error('invalid');
    });
    const req = mockReq({
      idempotencyKey: 'key-1',
      queue: 'myqueue',
      schedule: 'invalid-cron',
    });
    const res = mockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Invalid cron expression',
      schedule: 'invalid-cron',
    });
  });

  it('calls clearExistingJob when idempotency row exists', async () => {
    const existing = {
      idempotencyKey: 'key-1',
      pgBossJobId: 'old',
      queue: 'myqueue',
    };
    vi.mocked(db.query.jobIdempotency.findFirst).mockResolvedValue(
      existing as never,
    );
    const req = mockReq({
      idempotencyKey: 'key-1',
      queue: 'myqueue',
      schedule: '0 * * * *',
    });
    const res = mockRes();

    await handler(req, res);

    expect(jobIdempotencyService.clearExistingJob).toHaveBeenCalledWith(
      existing,
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('returns 500 when boss.send returns null', async () => {
    mockSend.mockResolvedValue(null);
    const req = mockReq({
      idempotencyKey: 'key-1',
      queue: 'myqueue',
      schedule: '0 * * * *',
    });
    const res = mockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Failed to schedule job',
    });
  });
});
