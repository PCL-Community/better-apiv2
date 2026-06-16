import { treaty } from '@elysiajs/eden'
import type { App } from 'better-apiv2-backend/src/index'
import { useAuthStore } from '../stores/auth'

const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

const baseApiClient = treaty<App>(baseURL, {
  fetcher: (input: RequestInfo | URL, init?: RequestInit) =>
    fetch(input, { ...init, credentials: 'include' }),
})

function normalizeWindowsLineBreaks(value: string) {
  return value.replace(/\r?\n/g, '\n')
}

function getAuthHeaders(token?: string | null) {
  if (!token) return {}
  return { Authorization: `Bearer ${token}` }
}

export function getAuthRequestOptions(token?: string | null) {
  return { headers: getAuthHeaders(token) }
}

// ============ 公开 API ============

/**
 * 获取公告列表
 */
export async function getAnnouncements() {
  const response = await baseApiClient.apiv2.announcements.get()
  return response.data ?? []
}

/**
 * 获取更新列表
 * @param channel - 版本渠道 (srarm64|frx64|srarm64|srx64)
 */
export async function getUpdates(channel?: string) {
  const response = await baseApiClient.apiv2.updates.get({
    query: channel ? { channel } : {},
  })
  return response.data
}

// ============ 认证 API ============

/**
 * 获取 GitHub OAuth 登录 URL
 * @param state - 用于 CSRF 保护的状态参数
 */
export function getGithubLoginUrl(state?: string): string {
  const params = new URLSearchParams()
  if (state) params.append('state', state)
  return `${baseURL}/auth/github/login${params.toString() ? `?${params.toString()}` : ''}`
}

/**
 * 处理 GitHub OAuth 回调并获取 token
 * @param code - GitHub OAuth 授权码
 */
export async function handleGithubCallback(code: string) {
  const response = await baseApiClient.auth.github.callback.get({
    query: { code },
  })
  return response.data
}

/**
 * 检查当前 token 是否有效并获取用户信息
 */
export async function checkAuth() {
  const response = await baseApiClient.admin.me.get()
  return response.data
}


/**
 * 登出并清除 token
 */
export async function logout() {
  const authStore = useAuthStore()
  try {
    const token = authStore.token
    if (token) {
      await baseApiClient.auth.github.logout.post(undefined, {
        headers: getAuthHeaders(token),
      })
    }
  } catch (error) {
    console.error('Logout API call failed:', error)
  }
  // 清除本地 token
  authStore.logout()
}

// ============ 管理员 API ============

/**
 * 获取当前管理员用户信息
 */
export async function getAdminProfile() {
  const authStore = useAuthStore()

  const response = await baseApiClient.admin.me.get({
    headers: getAuthHeaders(authStore.token),
  })
  return response.data
}

/**
 * 创建公告
 */
export async function createAnnouncement(data: {
  title: string
  details: string
  date: Date | string
  priority?: number
  level?: number
  skip?: {
    min?: string | null
    max?: string | null
    notBefore?: string | null
    notAfter?: string | null
  } | null
  buttons?: Array<{
    text: string
    exec: string
    argument: string
  }>
}) {
  const authStore = useAuthStore()

  const response = await baseApiClient.admin.announcements.post({
    title: data.title,
    details: normalizeWindowsLineBreaks(data.details),
    date: typeof data.date === 'string' ? data.date : data.date.toISOString(),
    priority: data.priority ?? 0,
    level: data.level ?? 0,
    skip: data.skip ?? null,
    buttons: data.buttons ?? [],
  }, {
    headers: getAuthHeaders(authStore.token),
  })
  return response.data
}

/**
 * 更新公告
 */
export async function updateAnnouncement(id: string, data: {
  title: string
  details: string
  date: Date | string
  priority?: number
  level?: number
  skip?: {
    min?: string | null
    max?: string | null
    notBefore?: string | null
    notAfter?: string | null
  } | null
  buttons?: Array<{
    text: string
    exec: string
    argument: string
  }>
}) {
  const authStore = useAuthStore()

  const response = await baseApiClient.admin.announcements({ id }).put({
    title: data.title,
    details: normalizeWindowsLineBreaks(data.details),
    date: typeof data.date === 'string' ? data.date : data.date.toISOString(),
    priority: data.priority ?? 0,
    level: data.level ?? 0,
    skip: data.skip ?? null,
    buttons: data.buttons ?? [],
  }, {
    headers: getAuthHeaders(authStore.token),
  })
  return response.data
}

/**
 * 删除公告
 */
export async function deleteAnnouncement(id: string) {
  const authStore = useAuthStore()

  const response = await baseApiClient.admin.announcements({ id }).delete(undefined, {
    headers: getAuthHeaders(authStore.token),
  })
  return response.data
}

/**
 * 上传新版本 EXE 并触发补丁生成
 */
export async function uploadUpdate(data: {
  file: File
  file_name: string
  version: {
    channel: 'frarm64' | 'frx64' | 'srarm64' | 'srx64'
    name: string
    code: number
  }
  changelog: string
  source_group?: string
  required: {
    dotnet: number
    windows: string
  }
}) {
  const authStore = useAuthStore()

  const formData = new FormData()
  formData.append('file', data.file)
  formData.append('file_name', data.file_name)
  formData.append('channel', data.version.channel)
  formData.append('version_name', data.version.name)
  formData.append('version_code', String(data.version.code))
  formData.append('changelog', data.changelog)
  formData.append('required_dotnet', String(data.required.dotnet))
  formData.append('required_windows', data.required.windows)
  if (data.source_group) {
    formData.append('source_group', data.source_group)
  }

  const response = await fetch(`${baseURL}/admin/updates`, {
    method: 'POST',
    headers: getAuthHeaders(authStore.token),
    credentials: 'include',
    body: formData,
  })

  const payload = await response.json()
  if (!response.ok) {
    throw new Error(payload?.error ?? '上传更新失败')
  }

  return payload
}

/**
 * 批量发版：一次上传多个文件到各自通道
 */
export async function batchUploadUpdates(data: {
  fileChannels: { file: File; channel: string }[]
  version_name: string
  version_code: number
  changelog: string
  source_group?: string
  required: {
    dotnet: number
    windows: string
  }
}) {
  const authStore = useAuthStore()

  const formData = new FormData()
  for (const { file, channel } of data.fileChannels) {
    formData.append(`file_${channel}`, file)
  }
  formData.append('version_name', data.version_name)
  formData.append('version_code', String(data.version_code))
  formData.append('changelog', data.changelog)
  formData.append('required_dotnet', String(data.required.dotnet))
  formData.append('required_windows', data.required.windows)
  if (data.source_group) {
    formData.append('source_group', data.source_group)
  }

  const response = await fetch(`${baseURL}/admin/updates/batch`, {
    method: 'POST',
    headers: getAuthHeaders(authStore.token),
    credentials: 'include',
    body: formData,
  })

  const payload = await response.json()
  if (!response.ok) {
    throw new Error(payload?.error ?? '批量发版失败')
  }

  return payload
}

/**
 * 更新已有版本的元数据
 */
export async function updateUpdate(id: string, data: {
  file_name?: string
  channel: 'frarm64' | 'frx64' | 'srarm64' | 'srx64'
  version_name: string
  version_code: number
  changelog: string
  source_group?: string
  required: {
    dotnet: number
    windows: string
  }
}) {
  const authStore = useAuthStore()

  const response = await baseApiClient.admin.updates({ id }).put({
    file_name: data.file_name,
    channel: data.channel,
    version_name: data.version_name,
    version_code: data.version_code,
    changelog: data.changelog,
    source_group: data.source_group ?? null,
    required: data.required,
  }, {
    headers: getAuthHeaders(authStore.token),
  })
  return response.data
}

/**
 * 删除版本更新资产
 */
export async function deleteUpdate(id: string) {
  const authStore = useAuthStore()

  const response = await baseApiClient.admin.updates({ id }).delete(undefined, {
    headers: getAuthHeaders(authStore.token),
  })
  return response.data
}

// ============ 下载源管理 API ============

/**
 * 获取下载源列表
 */
export async function getSources(groupName?: string) {
  const authStore = useAuthStore()

  const response = await baseApiClient.admin.sources.get({
    query: groupName ? { group: groupName } : {},
    headers: getAuthHeaders(authStore.token),
  })
  return response.data
}

/**
 * 创建下载源
 */
export async function createSource(data: {
  name: string
  baseUrl: string
  groupName: string
}) {
  const authStore = useAuthStore()

  const response = await fetch(`${baseURL}/admin/sources`, {
    method: 'POST',
    headers: {
      ...getAuthHeaders(authStore.token),
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({
      name: data.name,
      base_url: data.baseUrl,
      group_name: data.groupName,
    }),
  })

  const payload = await response.json()
  if (!response.ok) {
    throw new Error(payload?.error ?? '创建下载源失败')
  }

  return payload
}

/**
 * 更新下载源
 */
export async function updateSource(id: string, data: {
  name?: string
  baseUrl?: string
  groupName?: string
  enabled?: boolean
}) {
  const authStore = useAuthStore()

  const body: Record<string, unknown> = {}
  if (data.name !== undefined) body.name = data.name
  if (data.baseUrl !== undefined) body.base_url = data.baseUrl
  if (data.groupName !== undefined) body.group_name = data.groupName
  if (data.enabled !== undefined) body.enabled = data.enabled

  const response = await fetch(`${baseURL}/admin/sources/${id}`, {
    method: 'PUT',
    headers: {
      ...getAuthHeaders(authStore.token),
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(body),
  })

  const payload = await response.json()
  if (!response.ok) {
    throw new Error(payload?.error ?? '更新下载源失败')
  }

  return payload
}

/**
 * 删除下载源
 */
export async function deleteSource(id: string) {
  const authStore = useAuthStore()

  const response = await fetch(`${baseURL}/admin/sources/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(authStore.token),
    credentials: 'include',
  })

  const payload = await response.json()
  if (!response.ok) {
    throw new Error(payload?.error ?? '删除下载源失败')
  }

  return payload
}

/**
 * 兼容旧调用：如果外部还在用 upsertUpdate，则默认走上传流程
 */
export const upsertUpdate = uploadUpdate

// ============ 导出原始 client（高级用法）============

/**
 * 原始 API 客户端（用于非认证请求）
 */
export const api = baseApiClient
