import { sanitizeEnvValue } from './env-values';

const DEFAULT_LOCAL_PROTOCOL = 'http://';
const DEFAULT_REMOTE_PROTOCOL = 'https://';
const ORIGIN_SCHEME_RE = /^[a-z][a-z\d+\-.]*:\/\//i;

function addDefaultProtocol(origin: string): string {
  const lowerOrigin = origin.toLowerCase();
  const isLocalOrigin =
    lowerOrigin.startsWith('localhost') ||
    lowerOrigin.startsWith('127.0.0.1') ||
    lowerOrigin.startsWith('[::1]');

  return `${isLocalOrigin ? DEFAULT_LOCAL_PROTOCOL : DEFAULT_REMOTE_PROTOCOL}${origin}`;
}

export function normalizeOrigin(origin: string): string | null {
  const trimmedOrigin = sanitizeEnvValue(origin);

  if (!trimmedOrigin) {
    return null;
  }

  if (trimmedOrigin === '*') {
    return '*';
  }

  const candidate = ORIGIN_SCHEME_RE.test(trimmedOrigin)
    ? trimmedOrigin
    : addDefaultProtocol(trimmedOrigin);

  try {
    return new URL(candidate).origin;
  } catch {
    return null;
  }
}

export function parseAllowedOrigins(rawOrigins = process.env.ALLOWED_ORIGINS): string[] {
  const sanitizedOrigins = sanitizeEnvValue(rawOrigins);
  const normalizedOrigins = (sanitizedOrigins
    ? sanitizedOrigins.split(',').map(origin => normalizeOrigin(origin)).filter(Boolean)
    : ['*']) as string[];

  return normalizedOrigins.length > 0 ? [...new Set(normalizedOrigins)] : ['*'];
}

export const ALLOWED_ORIGINS = parseAllowedOrigins();

const ALLOW_ALL_ORIGINS = ALLOWED_ORIGINS.includes('*');
const DEFAULT_ALLOWED_ORIGIN = ALLOW_ALL_ORIGINS ? '*' : ALLOWED_ORIGINS[0] || '';

export const CORS_BASE_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Credentials': 'false',
  'Access-Control-Max-Age': '86400',
};

export function getAllowedOrigin(origin?: string | null): string | null {
  if (ALLOW_ALL_ORIGINS) {
    return origin ? normalizeOrigin(origin) : '*';
  }

  if (!origin) {
    return DEFAULT_ALLOWED_ORIGIN || null;
  }

  const normalizedOrigin = normalizeOrigin(origin);
  if (!normalizedOrigin) {
    return DEFAULT_ALLOWED_ORIGIN || null;
  }

  return ALLOWED_ORIGINS.includes(normalizedOrigin) ? normalizedOrigin : null;
}

export function getCorsHeaders(origin?: string | null): Record<string, string> {
  const allowedOrigin = getAllowedOrigin(origin);
  const headers: Record<string, string> = {
    ...CORS_BASE_HEADERS,
    Vary: 'Origin',
  };

  if (allowedOrigin) {
    headers['Access-Control-Allow-Origin'] = allowedOrigin;
  }

  return headers;
}
