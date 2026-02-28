import crypto from 'crypto';
import { logger } from './logger';

interface VerifySignatureOptions {
  payload: string;
  signature: string | null;
  secret: string;
  options?: {
    algorithm?: 'sha512' | 'sha256' | 'sha1' | 'md5';
    encoding?: 'hex' | 'base64';
  };
  tolerance?: number; // in seconds, default 300 (5 minutes)
}
export function verifySignature(opts: VerifySignatureOptions): boolean {
  const { payload, signature, secret, tolerance = 300, options } = opts;
  const { algorithm = 'sha512', encoding = 'hex' } = options ?? {};

  if (!signature || !secret) return false;

  // Parse the signature header: "t=<timestamp>,v1=<signature>"
  const parts = signature.split(',');
  let timestamp: number | null = null;
  let signatureValue: string | null = null;

  for (const part of parts) {
    const [key, value] = part.split('=');
    if (key === 't' && value !== undefined) {
      timestamp = parseInt(value, 10);
    } else if (key === 'v1' && value !== undefined) {
      signatureValue = value;
    }
  }

  if (!timestamp || !signatureValue) return false;

  // Validate timestamp is in seconds (not milliseconds)
  // Timestamps in seconds for current time are ~1.7 billion, milliseconds are ~1.7 trillion
  // Reject timestamps that are clearly in milliseconds range (> 1e12)
  if (timestamp > 1e12) {
    logger.warn(
      { timestamp },
      'Timestamp appears to be in milliseconds, not seconds',
    );
    return false; // Timestamp appears to be in milliseconds, not seconds
  }

  // Check timestamp tolerance
  // Date.now() returns milliseconds, so convert to seconds for comparison
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > tolerance) {
    return false; // Signature too old or from future
  }

  const expectedSignature = crypto
    .createHmac(algorithm, secret)
    .update(`${timestamp.toString()}.`)
    .update(payload)
    .digest(encoding);

  // Compare signatures using timing-safe comparison
  return crypto.timingSafeEqual(
    Buffer.from(signatureValue, encoding),
    Buffer.from(expectedSignature, encoding),
  );
}
