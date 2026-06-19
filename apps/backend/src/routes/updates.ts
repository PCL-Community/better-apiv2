import { Elysia } from 'elysia'
import { UpdateService } from '../services/update'
import { createRateLimiter, getClientIp } from '../services/rate-limiter'

const publicRateLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: 200 })

function parseChannelFromPathSegment(raw: string): string | null {
  const normalized = raw.toLowerCase().replace(/\.json$/, '')

  const match = normalized.match(/^updates-(frarm64|frx64|srarm64|srx64)$/)
  if (match) {
    const channel = match[1]
    if (channel) return channel
  }

  if (['frarm64', 'frx64', 'srarm64', 'srx64'].includes(normalized)) {
    return normalized
  }

  return null
}

function getBaseUrl(request: Request): string {
  const proto = request.headers.get('x-forwarded-proto')
  const host = request.headers.get('x-forwarded-host')

  if (proto && host) {
    return `${proto}://${host}`
  }

  const url = new URL(request.url)

  if (proto && proto !== url.protocol.replace(':', '')) {
    if (host) return `${proto}://${host}`
    return url.origin.replace(/^http:/, `${proto}:`)
  }

  if (host) {
    return url.origin.replace(url.host, host)
  }

  return url.origin
}

export const updateRoutes = new Elysia({ prefix: '/apiv2' })
  .get('/cache.json', async ({ request }) => {
    const clientIp = getClientIp(request)
    const rateCheck = publicRateLimiter(clientIp)
    if (!rateCheck.allowed) return {}

    try {
      return await UpdateService.computeCache(getBaseUrl(request))
    } catch (error) {
      console.error('生成缓存失败:', error)
      return {}
    }
  })
  .get('/cache', async ({ request }) => {
    const clientIp = getClientIp(request)
    const rateCheck = publicRateLimiter(clientIp)
    if (!rateCheck.allowed) return {}

    try {
      return await UpdateService.computeCache(getBaseUrl(request))
    } catch (error) {
      console.error('生成缓存失败:', error)
      return {}
    }
  })
  .get('/updates/updates-:channel.json', async ({ params, request, set }) => {
    const clientIp = getClientIp(request)
    const rateCheck = publicRateLimiter(clientIp)
    if (!rateCheck.allowed) return { assets: [] }

    try {
      const rawChannel = (params as Record<string, string>)['channel.json'] ?? ''
      const channel = rawChannel.toLowerCase()
      if (!['frarm64', 'frx64', 'srarm64', 'srx64'].includes(channel)) {
        set.status = 404
        return { assets: [] }
      }
      return await UpdateService.getUpdatesByChannel(channel, getBaseUrl(request))
    } catch (error) {
      console.error('获取更新失败:', error)
      return { assets: [] }
    }
  })
  .get('/updates/:id', async ({ params, set, request }) => {
    const clientIp = getClientIp(request)
    const rateCheck = publicRateLimiter(clientIp)
    if (!rateCheck.allowed) return { assets: [] }

    try {
      const channel = parseChannelFromPathSegment(params.id)
      if (!channel) {
        set.status = 404
        return { assets: [] }
      }
      return await UpdateService.getUpdatesByChannel(channel, getBaseUrl(request))
    } catch (error) {
      console.error('获取更新失败:', error)
      return { assets: [] }
    }
  })
  .get('/updates', async ({ query, request }: { query?: Record<string, string>, request: Request }) => {
    const clientIp = getClientIp(request)
    const rateCheck = publicRateLimiter(clientIp)
    if (!rateCheck.allowed) return { assets: [] }

    try {
      const channel = query?.channel?.trim()
      if (channel) {
        return await UpdateService.getUpdatesByChannel(channel, getBaseUrl(request))
      }

      return await UpdateService.getAllUpdates(getBaseUrl(request))
    } catch (error) {
      console.error('获取更新失败:', error)
      return { assets: [] }
    }
  })
  .get('/updates/:id/download', async ({ params, set, request }) => {
    const clientIp = getClientIp(request)
    const rateCheck = publicRateLimiter(clientIp)
    if (!rateCheck.allowed) {
      set.status = 429
      return { success: false, error: '请求过于频繁' }
    }

    try {
      const info = await UpdateService.getUpdateDownloadInfo(params.id)
      if (!info) {
        set.status = 404
        return { success: false, error: '更新文件不存在' }
      }

      if (info.redirectUrl) {
        return Response.redirect(info.redirectUrl, 302)
      }

      const file = Bun.file(info.filePath)
      if (!(await file.exists())) {
        set.status = 404
        return { success: false, error: '更新文件不存在' }
      }

      set.headers['content-type'] = 'application/zip'
      set.headers['content-disposition'] = `attachment; filename="${info.sha256}.zip"`
      return new Response(file)
    } catch (error) {
      console.error('下载更新文件失败:', error)
      set.status = 500
      return { success: false, error: '获取下载地址失败' }
    }
  })

export const staticRoutes = new Elysia()
  .get('/static/patch/:filename', async ({ params, set, request }) => {
    const clientIp = getClientIp(request)
    const rateCheck = publicRateLimiter(clientIp)
    if (!rateCheck.allowed) {
      set.status = 429
      return { success: false, error: '请求过于频繁' }
    }

    try {
      const filename = params.filename
      const hashPair = filename.replace('.patch', '')
      const [oldSha256, newSha256] = hashPair.split('_')

      if (!filename.endsWith('.patch') || !oldSha256 || !newSha256) {
        set.status = 400
        return { success: false, error: '文件名格式错误' }
      }

      const info = await UpdateService.getPatchDownloadInfoCombined(oldSha256, newSha256)
      if (!info || !info.filePath) {
        set.status = 404
        return { success: false, error: '补丁文件不存在' }
      }

      if (info.redirectUrl) {
        return Response.redirect(info.redirectUrl, 302)
      }

      const file = Bun.file(info.filePath)
      if (!(await file.exists())) {
        set.status = 404
        return { success: false, error: '补丁文件不存在' }
      }

      set.headers['content-type'] = 'application/octet-stream'
      set.headers['content-disposition'] = `attachment; filename="${info.fileName}"`
      return new Response(file)
    } catch (error) {
      console.error('获取补丁下载地址失败:', error)
      set.status = 500
      return { success: false, error: '获取补丁下载地址失败' }
    }
  })
