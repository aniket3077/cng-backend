import jwt from 'jsonwebtoken';
import { JWT_SECRET } from './env';
import { JWTPayload } from './auth';

export interface RefreshTokenPayload {
  userId: string;
  email: string;
  role: string;
  tokenVersion: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/**
 * Generate a refresh token with longer expiry
 * @param payload - User data with token version
 * @returns Refresh token string
 */
export function signRefreshToken(payload: RefreshTokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: '30d', // Refresh token valid for 30 days
  });
}

/**
 * Verify and decode a refresh token
 * @param token - Refresh token string
 * @returns Decoded payload or null if invalid
 */
export function verifyRefreshToken(token: string): RefreshTokenPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as RefreshTokenPayload;
    return decoded;
  } catch (error) {
    return null;
  }
}

/**
 * Generate both access and refresh tokens
 * @param payload - User data
 * @param tokenVersion - Token version for refresh token
 * @returns Token pair with access and refresh tokens
 */
export function generateTokenPair(payload: JWTPayload, tokenVersion: number = 1): TokenPair {
  const accessToken = jwt.sign(payload, JWT_SECRET, {
    expiresIn: '2d', // Access token valid for 2 days
  });

  const refreshTokenPayload: RefreshTokenPayload = {
    ...payload,
    tokenVersion,
  };

  const refreshToken = signRefreshToken(refreshTokenPayload);

  return {
    accessToken,
    refreshToken,
  };
}

/**
 * Refresh access token using refresh token
 * @param refreshToken - Refresh token string
 * @param currentTokenVersion - Current user's token version
 * @returns New access token or null if invalid
 */
export function refreshAccessToken(refreshToken: string, currentTokenVersion: number): string | null {
  const decoded = verifyRefreshToken(refreshToken);
  
  if (!decoded) {
    return null;
  }

  // Check if token version matches (prevents token reuse after logout)
  if (decoded.tokenVersion !== currentTokenVersion) {
    return null;
  }

  // Generate new access token
  const accessTokenPayload: JWTPayload = {
    userId: decoded.userId,
    email: decoded.email,
    role: decoded.role,
  };

  return jwt.sign(accessTokenPayload, JWT_SECRET, {
    expiresIn: '2d',
  });
}
