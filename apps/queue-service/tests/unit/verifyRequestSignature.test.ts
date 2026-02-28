import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { verifyRequestSignature } from '../../src/middlewares/verifyRequestSignature';
import { verifySignature } from '../../src/utils/verifySignature';

vi.mock('../../src/env', () => ({
  default: { API_SIGNING_SECRET: 'test-secret' },
}));

vi.mock('../../src/utils/verifySignature', () => ({
  verifySignature: vi.fn(),
}));

function mockReq(overrides: Partial<Request> = {}): Request {
  return {
    body: undefined,
    headers: {},
    ...overrides,
  } as Request;
}

function mockRes(): Response {
  const res = {} as Response;
  res.status = vi.fn().mockReturnThis();
  res.json = vi.fn().mockReturnThis();
  return res;
}

function mockNext(): NextFunction {
  return vi.fn();
}

describe('verifyRequestSignature', () => {
  const middleware = verifyRequestSignature();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when body is undefined', () => {
    const req = mockReq({ body: undefined });
    const res = mockRes();
    const next = mockNext();
    middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Missing body' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 400 when body is null', () => {
    const req = mockReq({ body: null });
    const res = mockRes();
    const next = mockNext();
    middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Missing body' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when signature is invalid', () => {
    vi.mocked(verifySignature).mockReturnValue(false);
    const req = mockReq({
      body: Buffer.from('{"a":1}', 'utf8'),
      headers: { 'x-bq-queue-request-signature': 'invalid' },
    });
    const res = mockRes();
    const next = mockNext();
    middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Invalid or missing signature',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('parses JSON body and calls next when signature is valid', () => {
    vi.mocked(verifySignature).mockReturnValue(true);
    const jsonBody = '{"foo":"bar"}';
    const req = mockReq({
      body: Buffer.from(jsonBody, 'utf8'),
      headers: { 'x-bq-queue-request-signature': 't=1,v1=abc' },
    });
    const res = mockRes();
    const next = mockNext();
    middleware(req, res, next);
    expect(verifySignature).toHaveBeenCalledWith({
      payload: jsonBody,
      signature: 't=1,v1=abc',
      secret: 'test-secret',
    });
    expect(req.body).toEqual({ foo: 'bar' });
    expect(next).toHaveBeenCalled();
  });

  it('leaves body as string when valid signature but non-JSON payload', () => {
    vi.mocked(verifySignature).mockReturnValue(true);
    const plainBody = 'not json';
    const req = mockReq({
      body: plainBody,
      headers: { 'x-bq-queue-request-signature': 't=1,v1=abc' },
    });
    const res = mockRes();
    const next = mockNext();
    middleware(req, res, next);
    expect(req.body).toBe(plainBody);
    expect(next).toHaveBeenCalled();
  });
});
