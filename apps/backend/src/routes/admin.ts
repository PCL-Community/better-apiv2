import { Elysia, t } from 'elysia'
import { AnnouncementService } from '../services/announcement'
import { UpdateService, ReleaseSourceService } from '../services/update'
import { requireAdminByAuthorizationHeader } from '../services/admin-guard'

function normalizeAnnouncementBody(body: any) {
  const buttons = Array.isArray(body.buttons)
    ? body.buttons
    : [body.button1, body.button2].filter(Boolean)

  return {
    title: String(body.title ?? '').trim(),
    details: String(body.details ?? body.detail ?? '').trim(),
    priority: Number(body.priority ?? 0),
    level: Number(body.level ?? 0),
    date: new Date(body.date),
    skip: body.skip ?? null,
    buttons,
  }
}

export const adminRoutes = new Elysia({ prefix: '/admin' })
  .resolve({ as: 'scoped' }, async ({ headers, set }) => {
    const authResult = await requireAdminByAuthorizationHeader(headers.authorization)
    if ('error' in authResult) {
      set.status = authResult.error === 'forbidden' ? 403 : 401
      // Returning early; handler checks this signal
      return { adminUser: null, authError: authResult }
    }
    return { adminUser: authResult, authError: null }
  })
  .get('/me', async ({ adminUser, authError, set }) => {
    if (authError) {
      return { success: false, error: authError.message }
    }
    return {
      success: true,
      user: {
        id: adminUser!.id,
        githubId: adminUser!.githubId,
        login: adminUser!.login,
        name: adminUser!.name,
        avatarUrl: adminUser!.avatarUrl,
        expiresAt: adminUser!.expiresAt,
        isTeamMember: adminUser!.isTeamMember,
      },
    }
  })
  // ── Announcements ──────────────────────────────────────────────────────
  .post('/announcements', async ({ adminUser, authError, body, set }) => {
    if (authError) {
      set.status = authError.error === 'forbidden' ? 403 : 401
      return { success: false, error: authError.message }
    }
    try {
      const result = await AnnouncementService.createAnnouncement(normalizeAnnouncementBody(body))
      return { success: true, data: result }
    } catch (error) {
      set.status = 400
      return { success: false, error: error instanceof Error ? error.message : '创建公告失败' }
    }
  })
  .put('/announcements/:id', async ({ adminUser, authError, params: { id }, body, set }) => {
    if (authError) {
      set.status = authError.error === 'forbidden' ? 403 : 401
      return { success: false, error: authError.message }
    }
    try {
      const result = await AnnouncementService.updateAnnouncement(id, normalizeAnnouncementBody(body))
      return { success: true, data: result }
    } catch (error) {
      set.status = 400
      return { success: false, error: error instanceof Error ? error.message : '更新公告失败' }
    }
  })
  .delete('/announcements/:id', async ({ adminUser, authError, params: { id }, set }) => {
    if (authError) {
      set.status = authError.error === 'forbidden' ? 403 : 401
      return { success: false, error: authError.message }
    }
    try {
      await AnnouncementService.deleteAnnouncement(id)
      return { success: true }
    } catch (error) {
      set.status = 400
      return { success: false, error: error instanceof Error ? error.message : '删除公告失败' }
    }
  })
  // ── Updates: Single Upload ──────────────────────────────────────────────
  .post('/updates', async ({ adminUser, authError, request, set }) => {
    if (authError) {
      set.status = authError.error === 'forbidden' ? 403 : 401
      return { success: false, error: authError.message }
    }
    try {
      const formData = await request.formData()
      const file = formData.get('file')
      const fileName = String(formData.get('file_name') ?? '').trim()
      const channel = String(formData.get('channel') ?? '').trim()
      const versionName = String(formData.get('version_name') ?? '').trim()
      const versionCode = Number(formData.get('version_code'))
      const changelog = String(formData.get('changelog') ?? '').trim()
      const sourceGroup = String(formData.get('source_group') ?? '').trim()

      if (!(file instanceof File)) {
        set.status = 400
        return { success: false, error: '请上传 exe 文件' }
      }

      const result = await UpdateService.createUpdateFromUpload({
        file,
        fileName: fileName || file.name,
        channel,
        versionName,
        versionCode,
        ...(sourceGroup ? { sourceGroup } : {}),
        changelog,
        uploadedByAdmin: adminUser!.login,
      })
      return { success: true, data: result }
    } catch (error) {
      set.status = 400
      console.error('创建更新失败:', error)
      return { success: false, error: error instanceof Error ? error.message : '创建更新失败' }
    }
  })
  // ── Updates: Batch Release ─────────────────────────────────────────────
  .post('/updates/batch', async ({ adminUser, authError, request, set }) => {
    if (authError) {
      set.status = authError.error === 'forbidden' ? 403 : 401
      return { success: false, error: authError.message }
    }
    try {
      const formData = await request.formData()
      const versionName = String(formData.get('version_name') ?? '').trim()
      const versionCode = Number(formData.get('version_code'))
      const changelog = String(formData.get('changelog') ?? '').trim()
      const sourceGroup = String(formData.get('source_group') ?? '').trim()

      const fileChannels: { file: File; channel: string }[] = []
      for (const [key, value] of formData.entries()) {
        if (value && typeof value === 'object' && 'name' in value && 'size' in value) {
          const channelMatch = key.match(/^file_(frarm64|frx64|srarm64|srx64)$/)
          fileChannels.push({
            file: value as unknown as File,
            channel: channelMatch ? channelMatch[1]! : 'frarm64',
          })
        }
      }

      if (fileChannels.length === 0) {
        set.status = 400
        return { success: false, error: '请至少上传一个文件' }
      }

      const results = await UpdateService.batchRelease({
        versionName,
        versionCode,
        ...(sourceGroup ? { sourceGroup } : {}),
        changelog,
        uploadedByAdmin: adminUser!.login,
        fileChannels,
      })
      return { success: true, data: results }
    } catch (error) {
      set.status = 400
      console.error('批量发版失败:', error)
      return { success: false, error: error instanceof Error ? error.message : '批量发版失败' }
    }
  })
  // ── Updates: Update Metadata ────────────────────────────────────────────
  .put('/updates/:id', async ({ adminUser, authError, params: { id }, body, set }) => {
    if (authError) {
      set.status = authError.error === 'forbidden' ? 403 : 401
      return { success: false, error: authError.message }
    }
    try {
      const result = await UpdateService.updateMetadata(id, {
        fileName: body.file_name,
        channel: body.channel,
        versionName: body.version_name,
        versionCode: Number(body.version_code),
        sourceGroup: body.source_group,
        changelog: body.changelog,
      })
      return { success: true, data: result }
    } catch (error) {
      set.status = 400
      console.error('更新元数据失败:', error)
      return { success: false, error: error instanceof Error ? error.message : '更新资产失败' }
    }
  })
  // ── Updates: Delete ────────────────────────────────────────────────────
  .delete('/updates/:id', async ({ adminUser, authError, params: { id }, set }) => {
    if (authError) {
      set.status = authError.error === 'forbidden' ? 403 : 401
      return { success: false, error: authError.message }
    }
    try {
      await UpdateService.deleteUpdate(id)
      return { success: true }
    } catch (error) {
      set.status = 400
      console.error('删除更新失败:', error)
      return { success: false, error: error instanceof Error ? error.message : '删除资产失败' }
    }
  })
  // ── Release Sources: List ──────────────────────────────────────────────
  .get('/sources', async ({ adminUser, authError, query, set }) => {
    if (authError) {
      set.status = authError.error === 'forbidden' ? 403 : 401
      return { success: false, error: authError.message }
    }
    try {
      const sources = await ReleaseSourceService.listSources(query.group)
      return { success: true, data: sources }
    } catch (error) {
      set.status = 500
      return { success: false, error: error instanceof Error ? error.message : '获取源列表失败' }
    }
  })
  // ── Release Sources: Create ────────────────────────────────────────────
  .post('/sources', async ({ adminUser, authError, body, set }) => {
    if (authError) {
      set.status = authError.error === 'forbidden' ? 403 : 401
      return { success: false, error: authError.message }
    }
    try {
      const result = await ReleaseSourceService.createSource({
        name: String(body.name ?? '').trim(),
        baseUrl: String(body.baseUrl ?? body.base_url ?? '').trim(),
        groupName: String(body.groupName ?? body.group_name ?? '').trim(),
      })
      return { success: true, data: result }
    } catch (error) {
      set.status = 400
      return { success: false, error: error instanceof Error ? error.message : '创建源失败' }
    }
  })
  // ── Release Sources: Update ────────────────────────────────────────────
  .put('/sources/:id', async ({ adminUser, authError, params: { id }, body, set }) => {
    if (authError) {
      set.status = authError.error === 'forbidden' ? 403 : 401
      return { success: false, error: authError.message }
    }
    try {
      const updateData: Record<string, unknown> = {}
      if (body.name?.trim()) updateData.name = body.name.trim()
      if (body.baseUrl?.trim() ?? body.base_url?.trim()) updateData.baseUrl = (body.baseUrl ?? body.base_url).trim()
      if (body.groupName?.trim() ?? body.group_name?.trim()) updateData.groupName = (body.groupName ?? body.group_name).trim()
      if (body.enabled !== undefined) updateData.enabled = Boolean(body.enabled)

      const result = await ReleaseSourceService.updateSource(id, updateData)
      return { success: true, data: result }
    } catch (error) {
      set.status = 400
      return { success: false, error: error instanceof Error ? error.message : '更新源失败' }
    }
  })
  // ── Release Sources: Delete ────────────────────────────────────────────
  .delete('/sources/:id', async ({ adminUser, authError, params: { id }, set }) => {
    if (authError) {
      set.status = authError.error === 'forbidden' ? 403 : 401
      return { success: false, error: authError.message }
    }
    try {
      await ReleaseSourceService.deleteSource(id)
      return { success: true }
    } catch (error) {
      set.status = 400
      return { success: false, error: error instanceof Error ? error.message : '删除源失败' }
    }
  })
