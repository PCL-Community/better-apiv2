import { Elysia } from 'elysia'
import { AnnouncementService } from '../services/announcement'
import { createRateLimiter, getClientIp } from '../services/rate-limiter'

const publicRateLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: 200 })

export const announcementRoutes = new Elysia({ prefix: '/apiv2' })
  .get('/announcements', async ({ request }) => {
    const clientIp = getClientIp(request)
    const rateCheck = publicRateLimiter(clientIp)
    if (!rateCheck.allowed) return { error: '请求过于频繁' }

    try {
      return await AnnouncementService.getAnnouncements()
    } catch (error) {
      console.error('获取公告失败:', error)
      return []
    }
  })
  .get('/announcements.json', async ({ request }) => {
    const clientIp = getClientIp(request)
    const rateCheck = publicRateLimiter(clientIp)
    if (!rateCheck.allowed) return { error: '请求过于频繁' }

    try {
      return await AnnouncementService.getAnnouncements()
    } catch (error) {
      console.error('获取公告失败:', error)
      return []
    }
  })
