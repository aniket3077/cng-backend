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
    // Get client IP
    const ip = request.ip || 
                request.headers.get('x-forwarded-for')?.split(',')[0] || 
                request.headers.get('x-real-ip') || 
                'unknown';

    // Create a mock request for express-rate-limit
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });
    
    const mockReq = {
      ip,
      headers,
    } as any;

    // Create a mock response
    let mockRes: any = {
      statusCode: 200,
      headers: {},
      data: null,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(data: any) {
        this.data = data;
        return this;
      },
      setHeader(name: string, value: string) {
        this.headers[name] = value;
        return this;
      },
    };

    // Apply rate limiting
    await new Promise((resolve, reject) => {
      limiter(mockReq, mockRes, (err: any) => {
        if (err) {
          reject(err);
        } else {
          resolve(mockRes);
        }
      });
    });

    // If rate limited, return error response
    if (mockRes.statusCode === 429) {
      return NextResponse.json(mockRes.data, { 
        status: 429,
        headers: {
          'Retry-After': mockRes.headers['Retry-After'] || '900'
        }
      });
    }

    // Continue with the actual handler
    return handler(request, ...args);
  };
}

// Rate limiting for different endpoint types
export const rateLimiters = {
  auth: (handler: Function) => withRateLimit(authRateLimit, handler),
  general: (handler: Function) => withRateLimit(generalRateLimit, handler),
};
