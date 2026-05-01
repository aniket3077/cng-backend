import rateLimit from 'express-rate-limit';
import { NextRequest, NextResponse } from 'next/server';

// Rate limiting configuration
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX_REQUESTS = 5; // Maximum requests per window

// Create rate limiter for authentication endpoints
export const authRateLimit = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_MAX_REQUESTS,
  message: {
    error: 'Too many authentication attempts. Please try again later.',
    retryAfter: Math.ceil(RATE_LIMIT_WINDOW_MS / 1000)
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Create rate limiter for general API endpoints
export const generalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per 15 minutes
  message: {
    error: 'Too many requests. Please try again later.',
    retryAfter: Math.ceil(RATE_LIMIT_WINDOW_MS / 1000)
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiting middleware for Next.js API routes
export function withRateLimit(limiter: any, handler: Function) {
  return async (request: NextRequest, ...args: any[]) => {
    // Disable express-rate-limit on Vercel because it expects an Express request object
    // and causes "TypeError: Cannot read properties of undefined (reading 'get')"
    return handler(request, ...args);
  };
}

// Rate limiting for different endpoint types
export const rateLimiters = {
  auth: (handler: Function) => withRateLimit(authRateLimit, handler),
  general: (handler: Function) => withRateLimit(generalRateLimit, handler),
};
