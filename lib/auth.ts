import jwt from 'jsonwebtoken';
import { NextRequest } from 'next/server';
import { JWT_SECRET } from './env';

export interface JWTPayload {
  userId: string;
  email: string;
  role: string;
}

/**
 * Sign a JWT token with user data
 * @param payload - User data to encode
 * @returns JWT token string
 */
export function signJwt(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: '7d', // Token valid for 7 days
  });
}

/**
 * Verify and decode a JWT token
 * @param token - JWT token string
 * @returns Decoded payload or null if invalid
 */
export function verifyJwt(token: string): JWTPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
    return decoded;
  } catch (error) {
    console.error('JWT verification failed:', error);
    return null;
  }
}

/**
 * Extract JWT token from Authorization header
 * @param request - Next.js request object
 * @returns Token string or null
 */
export function extractToken(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization');
  
  if (!authHeader) {
    return null;
  }

  // Support "Bearer <token>" format
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  // Support plain token
  return authHeader;
}

/**
 * Middleware helper to verify authentication
 * Returns user payload if valid, throws error otherwise
 * @param request - Next.js request object
 * @returns Decoded JWT payload
 */
export function requireAuth(request: NextRequest): JWTPayload {
  const token = extractToken(request);
  
  if (!token) {
    throw new Error('No authorization token provided');
  }

  const payload = verifyJwt(token);
  
  if (!payload) {
    throw new Error('Invalid or expired token');
  }

  return payload;
}

/**
 * Middleware helper to verify admin authentication
 * Returns admin payload if valid admin, throws error otherwise
 * @param request - Next.js request object
 * @returns Decoded JWT payload with admin verification
 */
export function requireAdmin(request: NextRequest): JWTPayload {
  const payload = requireAuth(request);
  
  if (payload.role !== 'admin') {
    throw new Error('Admin access required');
  }

  return payload;
}

// PRODUCTION NOTES:
// 1. Store JWT_SECRET securely (AWS Secrets Manager, env vars)
// 2. Consider shorter expiry (1-2 days) with refresh tokens
// 3. Add token revocation/blacklist for logout
// 4. Use HTTPS only in production
// 5. Consider HttpOnly cookies for web clients (more secure than localStorage)
