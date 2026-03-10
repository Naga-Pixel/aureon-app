/**
 * Rate Limiting with Upstash
 * Limits API requests to prevent abuse
 */

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// Initialize Redis for rate limiting (separate from cache for clarity)
function createRedisForRatelimit(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    console.warn('Upstash Redis not configured - rate limiting disabled');
    return null;
  }

  return new Redis({ url, token });
}

const redis = createRedisForRatelimit();

/**
 * Rate limiter for assessment endpoints
 * 10 requests per 10 seconds per IP
 */
export const assessmentRatelimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, '10 s'),
      analytics: true,
      prefix: 'ratelimit:assessment',
    })
  : null;

/**
 * Rate limiter for prospecting endpoints (more generous)
 * 20 requests per 10 seconds per IP
 */
export const prospectingRatelimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(20, '10 s'),
      analytics: true,
      prefix: 'ratelimit:prospecting',
    })
  : null;

/**
 * Check if rate limiting is enabled
 */
export function isRatelimitEnabled(): boolean {
  return redis !== null;
}
