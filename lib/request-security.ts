import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { extractToken } from './auth';

const REQUEST_SIGNATURE_MAX_AGE_MS = 5 * 60 * 1000;

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(',')}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
    left.localeCompare(right),
  );

  return `{${entries
    .map(([key, itemValue]) => `${JSON.stringify(key)}:${stableSerialize(itemValue)}`)
    .join(',')}}`;
}

export function getClientAddress(request: NextRequest) {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

export function createIdempotencyReference(prefix: string, idempotencyKey: string) {
  const digest = crypto.createHash('sha256').update(idempotencyKey).digest('hex').slice(0, 20);
  return `${prefix}-${digest}`.toUpperCase();
}

export function verifySignedRequest(request: NextRequest, payload: unknown) {
  const token = extractToken(request);
  const signature = request.headers.get('x-request-signature');
  const timestamp = request.headers.get('x-request-timestamp');
  const requestId = request.headers.get('x-request-id');
  const idempotencyKey = request.headers.get('x-idempotency-key');
  const deviceFingerprint = request.headers.get('x-device-fingerprint');

  if (!token || !signature || !timestamp || !requestId || !idempotencyKey) {
    return {
      valid: false,
      reason: 'Missing request signing headers',
      idempotencyKey: null,
      deviceFingerprint,
    };
  }

  const requestTimestamp = Number(timestamp);
  if (!Number.isFinite(requestTimestamp)) {
    return {
      valid: false,
      reason: 'Invalid request timestamp',
      idempotencyKey: null,
      deviceFingerprint,
    };
  }

  if (Math.abs(Date.now() - requestTimestamp) > REQUEST_SIGNATURE_MAX_AGE_MS) {
    return {
      valid: false,
      reason: 'Signed request expired',
      idempotencyKey: null,
      deviceFingerprint,
    };
  }

  const serializedPayload = stableSerialize(payload);
  const expectedSignature = crypto
    .createHash('sha256')
    .update(`${token}:${timestamp}:${requestId}:${serializedPayload}`)
    .digest('hex');

  const provided = Buffer.from(signature, 'utf8');
  const expected = Buffer.from(expectedSignature, 'utf8');

  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    return {
      valid: false,
      reason: 'Invalid request signature',
      idempotencyKey: null,
      deviceFingerprint,
    };
  }

  return {
    valid: true,
    reason: '',
    idempotencyKey,
    deviceFingerprint,
  };
}
