const requestCounts = new Map<string, { count: number; resetAt: number }>()

const DEFAULT_WINDOW_MS = 60_000
const DEFAULT_MAX_REQUESTS = 100

export function createRateLimiter(options?: {
  windowMs?: number
  maxRequests?: number
}) {
  const windowMs = options?.windowMs ?? DEFAULT_WINDOW_MS
  const maxRequests = options?.maxRequests ?? DEFAULT_MAX_REQUESTS

  return (ip: string): { allowed: boolean; remaining: number; resetAt: number } => {
    const now = Date.now()
    const record = requestCounts.get(ip)

    if (!record || now >= record.resetAt) {
      const newRecord = { count: 1, resetAt: now + windowMs }
      requestCounts.set(ip, newRecord)
      return { allowed: true, remaining: maxRequests - 1, resetAt: newRecord.resetAt }
    }

    record.count++
    return {
      allowed: record.count <= maxRequests,
      remaining: Math.max(0, maxRequests - record.count),
      resetAt: record.resetAt,
    }
  }
}

export function getClientIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown'
}
