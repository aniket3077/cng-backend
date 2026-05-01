/**
 * Redis-based Token Blacklist System
 * Production-ready token blacklist using Redis
 */

import { createClient, RedisClientType } from 'redis';

interface RedisConfig {
  url?: string;
  host?: string;
  port?: number;
  password?: string;
}

class RedisTokenBlacklist {
  private client: RedisClientType | null = null;
  private isConnected = false;
  private readonly TOKEN_PREFIX = 'blacklist:token:';
  private readonly DEFAULT_TTL = 7 * 24 * 60 * 60; // 7 days in seconds

  constructor() {
    this.initializeRedis();
  }

  private async initializeRedis(): Promise<void> {
    // Only initialize Redis if a URL is provided
    if (!process.env.REDIS_URL) {
      this.client = null;
      this.isConnected = false;
      return;
    }

    try {
      const redisConfig: RedisConfig = {
        // Use Redis URL from environment if available
        url: process.env.REDIS_URL,
        // Fallback to individual config
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
      };

      this.client = createClient(redisConfig);

      this.client.on('error', (err: Error) => {
        console.error('Redis Client Error:', err);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        console.log('Redis Client Connected');
        this.isConnected = true;
      });

      this.client.on('ready', () => {
        console.log('Redis Client Ready');
      });

      await this.client.connect();
    } catch (error) {
      console.warn('Redis connection failed, falling back to memory blacklist:', error);
      this.client = null;
      this.isConnected = false;
    }
  }

  /**
   * Add a token to the blacklist
   * @param token - JWT token to blacklist
   * @param expiresAt - Token expiry time in seconds (optional, defaults to 7 days)
   */
  async blacklistToken(token: string, expiresAt?: number): Promise<void> {
    if (this.client && this.isConnected) {
      try {
        const key = this.TOKEN_PREFIX + token;
        const ttl = expiresAt ? Math.max(0, expiresAt - Math.floor(Date.now() / 1000)) : this.DEFAULT_TTL;
        
        await this.client.setEx(key, ttl, '1');
        console.log(`Token blacklisted in Redis: ${token.substring(0, 10)}...`);
      } catch (error) {
        console.error('Failed to blacklist token in Redis:', error);
        // Fallback to memory blacklist
        this.fallbackBlacklist(token, expiresAt);
      }
    } else {
      // Fallback to memory blacklist
      this.fallbackBlacklist(token, expiresAt);
    }
  }

  /**
   * Check if a token is blacklisted
   * @param token - JWT token to check
   * @returns true if token is blacklisted
   */
  async isTokenBlacklisted(token: string): Promise<boolean> {
    if (this.client && this.isConnected) {
      try {
        const key = this.TOKEN_PREFIX + token;
        const result = await this.client.exists(key);
        return result === 1;
      } catch (error) {
        console.error('Failed to check token blacklist in Redis:', error);
        // Fallback to memory blacklist
        return this.fallbackIsBlacklisted(token);
      }
    } else {
      // Fallback to memory blacklist
      return this.fallbackIsBlacklisted(token);
    }
  }

  /**
   * Remove a token from the blacklist
   * @param token - JWT token to remove
   */
  async removeFromBlacklist(token: string): Promise<void> {
    if (this.client && this.isConnected) {
      try {
        const key = this.TOKEN_PREFIX + token;
        await this.client.del(key);
        console.log(`Token removed from blacklist: ${token.substring(0, 10)}...`);
      } catch (error) {
        console.error('Failed to remove token from blacklist in Redis:', error);
        // Fallback to memory blacklist
        this.fallbackRemoveFromBlacklist(token);
      }
    } else {
      // Fallback to memory blacklist
      this.fallbackRemoveFromBlacklist(token);
    }
  }

  /**
   * Get the number of blacklisted tokens
   * @returns Number of tokens in blacklist
   */
  async getBlacklistSize(): Promise<number> {
    if (this.client && this.isConnected) {
      try {
        const pattern = this.TOKEN_PREFIX + '*';
        const keys = await this.client.keys(pattern);
        return keys.length;
      } catch (error) {
        console.error('Failed to get blacklist size from Redis:', error);
        return this.fallbackGetBlacklistSize();
      }
    } else {
      return this.fallbackGetBlacklistSize();
    }
  }

  /**
   * Clear all blacklisted tokens
   */
  async clearBlacklist(): Promise<void> {
    if (this.client && this.isConnected) {
      try {
        const pattern = this.TOKEN_PREFIX + '*';
        const keys = await this.client.keys(pattern);
        if (keys.length > 0) {
          await this.client.del(keys);
        }
        console.log('Cleared all tokens from blacklist');
      } catch (error) {
        console.error('Failed to clear blacklist in Redis:', error);
        this.fallbackClearBlacklist();
      }
    } else {
      this.fallbackClearBlacklist();
    }
  }

  // Fallback memory-based blacklist (same as original)
  private memoryBlacklist = new Set<string>();
  private memoryExpiryMap = new Map<string, number>();

  private fallbackBlacklist(token: string, expiresAt?: number): void {
    this.memoryBlacklist.add(token);
    const expiry = expiresAt || Date.now() + 7 * 24 * 60 * 60 * 1000;
    this.memoryExpiryMap.set(token, expiry);
  }

  private fallbackIsBlacklisted(token: string): boolean {
    // Cleanup expired tokens
    this.cleanupExpiredMemoryTokens();
    return this.memoryBlacklist.has(token);
  }

  private fallbackRemoveFromBlacklist(token: string): void {
    this.memoryBlacklist.delete(token);
    this.memoryExpiryMap.delete(token);
  }

  private fallbackGetBlacklistSize(): number {
    this.cleanupExpiredMemoryTokens();
    return this.memoryBlacklist.size;
  }

  private fallbackClearBlacklist(): void {
    this.memoryBlacklist.clear();
    this.memoryExpiryMap.clear();
  }

  private cleanupExpiredMemoryTokens(): void {
    const now = Date.now();
    this.memoryExpiryMap.forEach((expiresAt, token) => {
      if (expiresAt < now) {
        this.memoryBlacklist.delete(token);
        this.memoryExpiryMap.delete(token);
      }
    });
  }

  /**
   * Check if Redis is connected
   */
  isRedisConnected(): boolean {
    return this.isConnected && this.client !== null;
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    if (this.client && this.isConnected) {
      await this.client.disconnect();
      this.isConnected = false;
    }
  }
}

// Export singleton instance
export const redisTokenBlacklist = new RedisTokenBlacklist();

// Export functions for backward compatibility
export const blacklistToken = (token: string, expiresAt?: number) => 
  redisTokenBlacklist.blacklistToken(token, expiresAt);

export const isTokenBlacklisted = (token: string) => 
  redisTokenBlacklist.isTokenBlacklisted(token);

export const removeFromBlacklist = (token: string) => 
  redisTokenBlacklist.removeFromBlacklist(token);

export const getBlacklistSize = () => 
  redisTokenBlacklist.getBlacklistSize();

export const clearBlacklist = () => 
  redisTokenBlacklist.clearBlacklist();
