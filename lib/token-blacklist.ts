/**
 * Token Blacklist System
 * Stores invalidated tokens to prevent reuse after logout
 */

interface BlacklistedToken {
  token: string;
  expiresAt: number;
}

// In-memory token blacklist (use Redis in production)
const tokenBlacklist = new Set<string>();
const tokenExpiryMap = new Map<string, number>();

// Cleanup expired tokens every hour
setInterval(() => {
  const now = Date.now();
  tokenExpiryMap.forEach((expiresAt, token) => {
    if (expiresAt < now) {
      tokenBlacklist.delete(token);
      tokenExpiryMap.delete(token);
    }
  });
}, 60 * 60 * 1000);

/**
 * Add a token to the blacklist
 * @param token - JWT token to blacklist
 * @param expiresAt - Token expiry time (optional, defaults to 7 days)
 */
export function blacklistToken(token: string, expiresAt?: number): void {
  tokenBlacklist.add(token);
  
  // Default to 7 days if not provided
  const expiry = expiresAt || Date.now() + 7 * 24 * 60 * 60 * 1000;
  tokenExpiryMap.set(token, expiry);
}

/**
 * Check if a token is blacklisted
 * @param token - JWT token to check
 * @returns true if token is blacklisted
 */
export function isTokenBlacklisted(token: string): boolean {
  return tokenBlacklist.has(token);
}

/**
 * Remove a token from the blacklist (rarely needed)
 * @param token - JWT token to remove
 */
export function removeFromBlacklist(token: string): void {
  tokenBlacklist.delete(token);
  tokenExpiryMap.delete(token);
}

/**
 * Get the number of blacklisted tokens
 * @returns Number of tokens in blacklist
 */
export function getBlacklistSize(): number {
  return tokenBlacklist.size;
}

/**
 * Clear all blacklisted tokens (for testing only)
 */
export function clearBlacklist(): void {
  tokenBlacklist.clear();
  tokenExpiryMap.clear();
}
