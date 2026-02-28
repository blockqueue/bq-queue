import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteJob } from '../../src/controllers/delete.controller';
import { db } from '../../src/db';
import * as jobIdempotencyService from '../../src/services/job-idempotency.service';

vi.mock('../../src/db', () => ({
  db: {
    query: {
      jobIdempotency: { findFirst: vi.fn() },
    },
  },
}));

function mockReq(body: unknown): import('express').Request {
  return { body } as import('express').Request;
}

function mockRes(): import('express').Response {
  const res = {} as import('express').Response;
  res.status = vi.fn().mockReturnThis();
  res.json = vi.fn().mockReturnThis();
  return res;
}

describe('deleteJob', () => {
  const handler = deleteJob();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.query.jobIdempotency.findFirst).mockResolvedValue(undefined);
    vi.spyOn(jobIdempotencyService, 'clearExistingJob').mockResolvedValue();
  });

  it('returns 200 and deleted: true when job exists', async () => {
    const idempotencyKey = 'my-unique-key';
    const existing = {
      idempotencyKey,
      pgBossJobId: 'job-1',
      queue: 'myqueue',
    };
    vi.mocked(db.query.jobIdempotency.findFirst).mockResolvedValue(
      existing as never,
    );
    const req = mockReq({
      idempotencyKey,
    });
    const res = mockRes();

    await handler(req, res);

    expect(jobIdempotencyService.clearExistingJob).toHaveBeenCalledWith(
      existing,
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ deleted: true });
  });

  it('returns 400 when idempotencyKey is empty or missing', async () => {
    const req = mockReq({ idempotencyKey: '' });
    const res = mockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Invalid body' }),
    );
    expect(jobIdempotencyService.clearExistingJob).not.toHaveBeenCalled();
  });

  it('returns 404 when job not found', async () => {
    vi.mocked(db.query.jobIdempotency.findFirst).mockResolvedValue(undefined);
    const req = mockReq({
      idempotencyKey: 'non-existent-key',
    });
    const res = mockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Job not found',
      idempotencyKey: 'non-existent-key',
    });
    expect(jobIdempotencyService.clearExistingJob).not.toHaveBeenCalled();
  });
});
