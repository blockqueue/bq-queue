import crypto from 'crypto';

export interface CreateSignatureOptions {
  payload: string;
  secret: string;
  timestamp?: number; // unix seconds; defaults to now
  algorithm?: 'sha512' | 'sha256' | 'sha1' | 'md5';
  encoding?: 'hex' | 'base64';
}

/**
 * Creates a signature header value in the same format as verifySignature expects:
 * "t=<unix_seconds>,v1=<signature>"
 * HMAC of timestamp + "." + payload.
 */
export function createSignature(opts: CreateSignatureOptions): string {
  const {
    payload,
    secret,
    timestamp = Math.floor(Date.now() / 1000),
    algorithm = 'sha512',
    encoding = 'hex',
  } = opts;

  const signature = crypto
    .createHmac(algorithm, secret)
    .update(`${timestamp}.`)
    .update(payload)
    .digest(encoding);

  return `t=${timestamp},v1=${signature}`;
}
