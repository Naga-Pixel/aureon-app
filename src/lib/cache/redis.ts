/**
 * Upstash Redis Cache Client
 * Provides shared caching across serverless instances
 */

import { Redis } from '@upstash/redis';

// Initialize Redis client (singleton)
let redisClient: Redis | null = null;

function getRedis(): Redis | null {
  if (redisClient) return redisClient;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    console.warn('Upstash Redis not configured - caching disabled');
    return null;
  }

  redisClient = new Redis({ url, token });
  return redisClient;
}

/**
 * Get a cached value by key
 * Returns null if not found or Redis is not configured
 */
export async function getCached<T>(key: string): Promise<T | null> {
  const redis = getRedis();
  if (!redis) return null;

  try {
    return await redis.get<T>(key);
  } catch (error) {
    console.error('Redis get error:', error);
    return null;
  }
}

/**
 * Set a cached value with TTL
 */
export async function setCache<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    await redis.setex(key, ttlSeconds, value);
  } catch (error) {
    console.error('Redis set error:', error);
  }
}

/**
 * Delete a cached value
 */
export async function deleteCache(key: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    await redis.del(key);
  } catch (error) {
    console.error('Redis delete error:', error);
  }
}

/**
 * Check if Redis is available
 */
export function isRedisConfigured(): boolean {
  return !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN;
}

/**
 * Export redis client for rate limiting
 */
export { getRedis as getRedisClient };
