import { NextFunction, Request, Response } from 'express';
import env from '../env';
import { verifySignature } from '../utils/verifySignature';

export function verifyRequestSignature() {
  return (req: Request, res: Response, next: NextFunction) => {
    const requestSigningSecret = env.REQUEST_SIGNING_SECRET;
    const rawBody = req.body;
    if (rawBody === undefined || rawBody === null) {
      res.status(400).json({ error: 'Missing body' });
      return;
    }
    const payload =
      typeof rawBody === 'string'
        ? rawBody
        : Buffer.isBuffer(rawBody)
          ? rawBody.toString('utf8')
          : JSON.stringify(rawBody);

    const signatureHeaderName = env.SIGNATURE_HEADER.toLowerCase();
    const signature = req.headers[signatureHeaderName] as string | undefined;
    const valid = verifySignature({
      payload,
      signature: signature ?? null,
      secret: requestSigningSecret,
    });
    if (!valid) {
      res.status(401).json({ error: 'Invalid or missing signature' });
      return;
    }
    try {
      req.body = JSON.parse(payload);
    } catch {
      req.body = payload;
    }
    next();
  };
}
