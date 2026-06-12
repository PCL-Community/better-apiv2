import { Elysia } from 'elysia'
import { UpdateService } from '../services/update'

function parseChannelFromPathSegment(raw: string): string | null {
  const normalized = raw.toLowerCase().replace(/\.json$/, '')

  // supports: updates-srx64, updates-srarm64, updates-frx64, updates-frarm64
  const match = normalized.match(/^updates-(frarm64|frx64|srarm64|srx64)$/)
  if (match) {
    const channel = match[1]
    if (channel) return channel
  }

  // also allow direct channel segment for compatibility: /updates/srx64
  if (['frarm64', 'frx64', 'srarm64', 'srx64'].includes(normalized)) {
    return normalized
  }

  return null
}

function getBaseUrl(request: Request): string {
  return new URL(request.url).origin
}

export const updateRoutes = new Elysia({ prefix: '/apiv2' })
  // ── v2 API: /apiv2/cache.json ──────────────────────────────────
  .get('/cache.json', async ({ request }) => {
    try {
      return await UpdateService.computeCache(getBaseUrl(request))
    } catch (error) {
      console.error('生成缓存失败:', error)
      return {}
    }
  })
  // ── v2 API: /apiv2/cache.json (top-level cache) ────────────────────────
  .get('/cache', async ({ request }) => {
    try {
      return await UpdateService.computeCache(getBaseUrl(request))
    } catch (error) {
      console.error('生成缓存失败:', error)
      return {}
    }
  })
  // ── v2 API: /apiv2/updates/updates-{channel}.json ──────────────────────
  .get('/updates/updates-:channel.json', async ({ params, request, set }) => {
    try {
      // Elysia captures the param as "channel.json", extract the channel part
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
  // ── Query-based: /apiv2/updates?channel=xxx ────────────────────────────
  .get('/updates', async ({ query, request }: { query?: Record<string, string>, request: Request }) => {
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
  // ── Download: /apiv2/updates/:id/download ──────────────────────────────
  .get('/updates/:id/download', async ({ params, set }) => {
    try {
      const redirectUrl = await UpdateService.getUpdateRedirectUrl(params.id)
      if (redirectUrl) {
        return Response.redirect(redirectUrl, 302)
      }

      // fallback to local file download
      const { filePath, sha256 } = (await UpdateService.getUpdateDownloadPathAndSha(params.id)) ?? {};
      if (!filePath || !sha256) {
        set.status = 404
        return { success: false, error: '更新文件不存在' }
      }

      const file = Bun.file(filePath)
      if (!(await file.exists())) {
        set.status = 404
        return { success: false, error: '更新文件不存在' }
      }

      // the stored file is already a zip file containing the updated exe
      set.headers['content-type'] = 'application/zip'
      set.headers['content-disposition'] = `attachment; filename="${sha256}.zip"`
      return new Response(file)
    } catch (error) {
      console.error('下载更新文件失败:', error)
      set.status = 500
      return { success: false, error: '获取下载地址失败' }
    }
  })
  // ── Patch download: /apiv2/updates/:id/patches/:patchId/download ───────
  .get('/updates/:id/patches/:patchId/download', async ({ params, set }) => {
    try {
      const patchInfo = await UpdateService.getPatchDownloadInfo(params.patchId)
      if (!patchInfo || !patchInfo.filePath) {
        set.status = 404
        return { success: false, error: '补丁文件不存在' }
      }

      const file = Bun.file(patchInfo.filePath)
      if (!(await file.exists())) {
        set.status = 404
        return { success: false, error: '补丁文件不存在' }
      }

      set.headers['content-type'] = 'application/octet-stream'
      set.headers['content-disposition'] = `attachment; filename="${patchInfo.fileName}"`
      return new Response(file)
    } catch (error) {
      console.error('下载补丁文件失败:', error)
      set.status = 500
      return { success: false, error: '下载补丁文件失败' }
    }
  })
  // ── Legacy: /apiv2/updates/:id (channel-based lookup) ──────────────────
  .get('/updates/:id', async ({ params, set, request }) => {
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

export const staticRoutes = new Elysia()
  // ── Patch redirect: /static/patch/{oldSha}_{newSha}.patch ───────────────
  .get('/static/patch/:filename', async ({ params, set }) => {
    try {
      const filename = params.filename
      if (!filename.endsWith('.patch')) {
        set.status = 404
        return { success: false, error: '文件格式不支持' }
      }

      const hashPair = filename.replace('.patch', '')
      const [oldSha256, newSha256] = hashPair.split('_')

      if (!oldSha256 || !newSha256) {
        set.status = 400
        return { success: false, error: '文件名格式错误' }
      }

      const redirectUrl = await UpdateService.getPatchRedirectUrlBySha256(oldSha256, newSha256)
      if (redirectUrl) {
        return Response.redirect(redirectUrl, 302)
      }

      const patchInfo = await UpdateService.getPatchDownloadInfoBySha256(oldSha256, newSha256)
      if (!patchInfo || !patchInfo.filePath) {
        set.status = 404
        return { success: false, error: '补丁文件不存在' }
      }

      const file = Bun.file(patchInfo.filePath)
      if (!(await file.exists())) {
        set.status = 404
        return { success: false, error: '补丁文件不存在' }
      }

      set.headers['content-type'] = 'application/octet-stream'
      set.headers['content-disposition'] = `attachment; filename="${patchInfo.fileName}"`
      return new Response(file)
    } catch (error) {
      console.error('获取补丁下载地址失败:', error)
      set.status = 500
      return { success: false, error: '获取补丁下载地址失败' }
    }
  })
