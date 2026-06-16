import Redis from 'ioredis'

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

const globalForRedis = global as unknown as { redis: Redis | undefined }

function createRedisClient(): Redis {
  const client = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      if (times > 3) return null
      return Math.min(times * 200, 2000)
    },
    lazyConnect: true,
  })

  client.on('error', (error) => {
    console.error('[Redis] Connection error:', error.message)
  })

  return client
}

export const redis = globalForRedis.redis ?? createRedisClient()

if (process.env.NODE_ENV !== 'production') {
  globalForRedis.redis = redis
}

const CACHE_PREFIX = 'better-api:'
const DEFAULT_TTL = 3600

export const CacheKeys = {
  channelUpdates: (channel: string, baseUrl?: string) =>
    `${CACHE_PREFIX}updates:channel:${channel}${baseUrl ? `:${baseUrl}` : ''}`,
  allUpdates: (baseUrl?: string) =>
    `${CACHE_PREFIX}updates:all${baseUrl ? `:${baseUrl}` : ''}`,
  cacheJson: (baseUrl?: string) =>
    `${CACHE_PREFIX}cache:json${baseUrl ? `:${baseUrl}` : ''}`,
  channelPattern: `${CACHE_PREFIX}updates:channel:*`,
  allPattern: `${CACHE_PREFIX}updates:all*`,
  cachePattern: `${CACHE_PREFIX}cache:*`,
} as const

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const raw = await redis.get(key)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export async function cacheSet(key: string, value: unknown, ttl = DEFAULT_TTL): Promise<void> {
  try {
    const raw = JSON.stringify(value)
    await redis.setex(key, ttl, raw)
  } catch (error) {
    console.error('[Redis] cacheSet error:', error)
  }
}

export async function cacheDel(key: string): Promise<void> {
  try {
    await redis.del(key)
  } catch (error) {
    console.error('[Redis] cacheDel error:', error)
  }
}

export async function invalidateChannelCache(channel: string): Promise<void> {
  try {
    const keys = await redis.keys(`${CACHE_PREFIX}updates:channel:${channel}:*`)
    if (keys.length > 0) await redis.del(...keys)
  } catch (error) {
    console.error('[Redis] invalidateChannelCache error:', error)
  }
}

export async function invalidateAllCache(): Promise<void> {
  try {
    const keys = await redis.keys(`${CACHE_PREFIX}*`)
    if (keys.length > 0) await redis.del(...keys)
  } catch (error) {
    console.error('[Redis] invalidateAllCache error:', error)
  }
}
