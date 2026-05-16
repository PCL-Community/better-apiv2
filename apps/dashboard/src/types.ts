// 用户信息
export interface User {
  id: string
  githubId: string
  login: string
  name: string | null
  avatarUrl: string | null
  expiresAt?: number | Date
}

// 管理员信息
export interface AdminUser extends User {
  expiresAt: number | Date
}

// 公告信息
export interface AnnouncementSkip {
  min?: string | null
  max?: string | null
  notBefore?: string | null
  notAfter?: string | null
}

export interface AnnouncementButton {
  text: string
  exec: string
  argument: string
}

export interface Announcement {
  id: string
  title: string
  details: string
  priority: number
  level: number
  date: string
  skip?: AnnouncementSkip | null
  buttons: AnnouncementButton[]
}

// 更新信息
export interface Update {
  id: string
  fileName: string
  channel: string
  versionName: string
  versionCode: number
  updateTime: Date
  downloads: number
  md5: string
}

// 更新资产（与后端 API 结构对齐）
export type UpdateChannel = 'frarm64' | 'frx64' | 'srarm64' | 'srx64'

export interface UpdateAssetItem {
  id: string
  fileName: string
  required: {
    dotnet: number
    windows: string
  }
  channel: UpdateChannel
  versionName: string
  versionCode: number
  updateTime: string
  downloads: string[]
  patches: string[]
  sha256: string
  changelog: string
}

export interface UpdateAssetResponse {
  id?: string
  file_name?: string
  required?: {
    dotnet?: number
    windows?: string
  }
  version?: {
    channel?: string
    name?: string
    code?: number
  }
  upd_time?: string
  downloads?: string[]
  patches?: string[]
  sha256?: string
  changelog?: string
}

// 下载源配置
export interface ReleaseSource {
  id: string
  name: string
  baseUrl: string
  groupName: string
  enabled: boolean
  createdAt?: string
}

// API 响应通用格式
export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: string
}

// 认证令牌
export interface AuthToken {
  accessToken: string
  expiresIn: number
}
