import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSignature } from '../../src/utils/createSignature';
import { verifySignature } from '../../src/utils/verifySignature';

describe('verifySignature', () => {
  const payload = '{"foo":"bar"}';
  const secret = 'test-secret';
  const now = Math.floor(Date.now() / 1000);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now * 1000);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns true for valid signature with correct payload and secret', () => {
    const signature = createSignature({ payload, secret, timestamp: now });
    expect(
      verifySignature({
        payload,
        signature,
        secret,
        tolerance: 300,
      }),
    ).toBe(true);
  });

  it('returns false when signature is null', () => {
    expect(
      verifySignature({
        payload,
        signature: null,
        secret,
      }),
    ).toBe(false);
  });

  it('returns false when signature is empty string', () => {
    expect(
      verifySignature({
        payload,
        signature: '',
        secret,
      }),
    ).toBe(false);
  });

  it('returns false when secret is empty', () => {
    const signature = createSignature({ payload, secret: 'x', timestamp: now });
    expect(
      verifySignature({
        payload,
        signature,
        secret: '',
      }),
    ).toBe(false);
  });

  it('returns false when secret is wrong', () => {
    const signature = createSignature({
      payload,
      secret: 'wrong-secret',
      timestamp: now,
    });
    expect(
      verifySignature({
        payload,
        signature,
        secret: 'correct-secret',
        tolerance: 300,
      }),
    ).toBe(false);
  });

  it('returns false when payload is tampered', () => {
    const signature = createSignature({
      payload: '{"original":true}',
      secret,
      timestamp: now,
    });
    expect(
      verifySignature({
        payload: '{"tampered":true}',
        signature,
        secret,
        tolerance: 300,
      }),
    ).toBe(false);
  });

  it('returns false when timestamp is outside tolerance (too old)', () => {
    const oldTimestamp = now - 400;
    const signature = createSignature({
      payload,
      secret,
      timestamp: oldTimestamp,
    });
    expect(
      verifySignature({
        payload,
        signature,
        secret,
        tolerance: 300,
      }),
    ).toBe(false);
  });

  it('returns false when timestamp is outside tolerance (future)', () => {
    const futureTimestamp = now + 400;
    const signature = createSignature({
      payload,
      secret,
      timestamp: futureTimestamp,
    });
    expect(
      verifySignature({
        payload,
        signature,
        secret,
        tolerance: 300,
      }),
    ).toBe(false);
  });

  it('returns true when timestamp is within custom tolerance', () => {
    const pastTimestamp = now - 100;
    const signature = createSignature({
      payload,
      secret,
      timestamp: pastTimestamp,
    });
    expect(
      verifySignature({
        payload,
        signature,
        secret,
        tolerance: 200,
      }),
    ).toBe(true);
  });

  it('returns false when timestamp is in milliseconds range', () => {
    const msTimestamp = now * 1000;
    const sig = createSignature({
      payload,
      secret,
      timestamp: now,
    });
    const parts = sig.split(',');
    const v1 = parts.find((p) => p.startsWith('v1='))?.slice(3) ?? '';
    const badSignature = `t=${msTimestamp},v1=${v1}`;
    expect(
      verifySignature({
        payload,
        signature: badSignature,
        secret,
        tolerance: 300,
      }),
    ).toBe(false);
  });

  it('verifies correctly with sha256 and hex encoding', () => {
    const signature = createSignature({
      payload,
      secret,
      timestamp: now,
      algorithm: 'sha256',
      encoding: 'hex',
    });
    expect(
      verifySignature({
        payload,
        signature,
        secret,
        tolerance: 300,
        options: { algorithm: 'sha256', encoding: 'hex' },
      }),
    ).toBe(true);
  });
});
