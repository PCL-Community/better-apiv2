export interface UpdateRequirements {
  dotnet: number
  windows: string
}

export interface Version {
  channel: 'frarm64' | 'frx64' | 'srarm64' | 'srx64'
  name: string
  code: number
}

export interface UpdateAsset {
  id: string
  file_name: string
  required: UpdateRequirements
  version: Version
  upd_time: string
  downloads: string[]
  patches: string[]
  sha256: string
  changelog: string
}

export interface UpdatesResponse {
  assets: UpdateAsset[]
}

export interface CacheResponse {
  [key: string]: string
}

export interface ReleaseSourceConfig {
  id: string
  name: string
  baseUrl: string
  groupName: string
  enabled: boolean
}
