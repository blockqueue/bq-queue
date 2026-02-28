import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSignature } from '../../src/utils/createSignature';
import { verifySignature } from '../../src/utils/verifySignature';

describe('createSignature', () => {
  const payload = '{"data":true}';
  const secret = 'my-secret';
  const fixedTimestamp = 1700000000;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(fixedTimestamp * 1000);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('outputs format t=<timestamp>,v1=<hex>', () => {
    const result = createSignature({
      payload,
      secret,
      timestamp: fixedTimestamp,
    });
    expect(result).toMatch(/^t=\d+,v1=[a-f0-9]+$/);
    const [tPart, v1Part] = result.split(',');
    expect(tPart).toBe(`t=${fixedTimestamp}`);
    expect(v1Part).toMatch(/^v1=[a-f0-9]+$/);
  });

  it('round-trips with verifySignature', () => {
    const signature = createSignature({
      payload,
      secret,
      timestamp: fixedTimestamp,
    });
    expect(
      verifySignature({
        payload,
        signature,
        secret,
        tolerance: 300,
      }),
    ).toBe(true);
  });

  it('uses current time when timestamp is omitted', () => {
    const result = createSignature({ payload, secret });
    const now = Math.floor(Date.now() / 1000);
    expect(result).toMatch(new RegExp(`^t=${now},v1=`));
  });

  it('produces verifiable signature with base64 encoding', () => {
    const signature = createSignature({
      payload,
      secret,
      timestamp: fixedTimestamp,
      encoding: 'base64',
    });
    expect(
      verifySignature({
        payload,
        signature,
        secret,
        tolerance: 300,
        options: { encoding: 'base64' },
      }),
    ).toBe(true);
  });
});
