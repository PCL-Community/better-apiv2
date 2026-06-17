import fs from 'fs/promises'
import fsSync from 'fs'
import path from 'path'
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'

type S3BackendConfig = {
  name: string
  endpoint?: string
  bucket: string
  region?: string
  accessKey?: string
  secretKey?: string
  publicBaseUrl?: string
  forcePathStyle?: boolean
}

type S3Backend = {
  name: string
  client: S3Client
  bucket: string
  publicBaseUrl: string
}

type UploadBufferOptions = {
  contentType?: string
  s3Key?: string
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '')
}

function sanitizeKeyPart(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '_')
}

function toBuffer(value: Buffer | Uint8Array | ArrayBuffer) {
  if (Buffer.isBuffer(value)) {
    return value
  }

  if (value instanceof ArrayBuffer) {
    return Buffer.from(value)
  }

  return Buffer.from(value)
}

function parseS3Backends(): S3Backend[] {
  const raw = process.env.S3_BACKENDS?.trim()
  if (!raw) return []

  let configs: S3BackendConfig[]
  try {
    configs = JSON.parse(raw)
    if (!Array.isArray(configs) || configs.length === 0) return []
  } catch {
    console.warn('[ObjectStorage] 无法解析 S3_BACKENDS，回退到传统单后端配置')
    return []
  }

  const backends: S3Backend[] = []
  for (const cfg of configs) {
    if (!cfg.name || !cfg.bucket) {
      console.warn('[ObjectStorage] 跳过无效的后端配置:', cfg)
      continue
    }

    backends.push({
      name: cfg.name,
      client: new S3Client({
        region: cfg.region || 'auto',
        forcePathStyle: cfg.forcePathStyle ?? true,
        ...(cfg.endpoint ? { endpoint: cfg.endpoint } : {}),
        ...(cfg.accessKey && cfg.secretKey
          ? {
              credentials: {
                accessKeyId: cfg.accessKey,
                secretAccessKey: cfg.secretKey,
              },
            }
          : {}),
      }),
      bucket: cfg.bucket,
      publicBaseUrl: trimTrailingSlash(cfg.publicBaseUrl || ''),
    })
  }

  return backends
}

function buildLegacyBackend(): S3Backend | null {
  const provider = (process.env.STORAGE_PROVIDER ?? 'local').toLowerCase()
  if (provider !== 's3' && provider !== 'r2') return null

  const bucket = process.env.S3_BUCKET ?? ''
  if (!bucket) {
    throw new Error('Missing S3_BUCKET environment variable')
  }

  return {
    name: provider,
    client: new S3Client({
      region: process.env.S3_REGION?.trim() || 'auto',
      forcePathStyle: provider !== 'r2',
      ...(process.env.S3_ENDPOINT?.trim()
        ? { endpoint: process.env.S3_ENDPOINT.trim() }
        : {}),
      ...(process.env.S3_ACCESS_KEY_ID?.trim() &&
      process.env.S3_SECRET_ACCESS_KEY?.trim()
        ? {
            credentials: {
              accessKeyId: process.env.S3_ACCESS_KEY_ID.trim(),
              secretAccessKey: process.env.S3_SECRET_ACCESS_KEY.trim(),
            },
          }
        : {}),
    }),
    bucket,
    publicBaseUrl: trimTrailingSlash(process.env.S3_PUBLIC_BASE_URL?.trim() || ''),
  }
}

export class ObjectStorageService {
  private readonly uploadDir = path.resolve(
    process.cwd(),
    process.env.UPLOAD_DIR ?? './uploads',
  )
  private readonly backends: S3Backend[]

  constructor() {
    const parsed = parseS3Backends()
    if (parsed.length > 0) {
      this.backends = parsed
      console.log(
        `[ObjectStorage] 已配置 ${this.backends.length} 个 S3 后端:`,
        this.backends.map((b) => b.name).join(', '),
      )
      return
    }

    const legacy = buildLegacyBackend()
    if (legacy) {
      this.backends = [legacy]
      return
    }

    this.backends = []
  }

  getProvider() {
    if (this.backends.length > 1) return 'multi'
    if (this.backends.length === 1) return this.backends[0]!.name
    return 'local'
  }

  getLocalPath(key: string) {
    return path.join(this.uploadDir, key)
  }

  getPublicLocation(key: string) {
    if (this.backends.length > 0 && this.backends[0]!.publicBaseUrl) {
      return `${this.backends[0]!.publicBaseUrl}/${key}`
    }

    if (this.backends.length > 0) {
      return `s3://${this.backends[0]!.bucket}/${key}`
    }

    return `local://${key}`
  }

  async uploadBuffer(
    key: string,
    buffer: Buffer | Uint8Array | ArrayBuffer,
    options: UploadBufferOptions = {},
  ) {
    const body = toBuffer(buffer)
    const localPath = this.getLocalPath(key)

    await fs.mkdir(path.dirname(localPath), { recursive: true })
    await fs.writeFile(localPath, body)

    if (this.backends.length > 0) {
      const remoteKey = options.s3Key ?? key
      const results = await Promise.allSettled(
        this.backends.map((backend) =>
          backend.client.send(
            new PutObjectCommand({
              Bucket: backend.bucket,
              Key: remoteKey,
              Body: body,
              ContentType: options.contentType ?? 'application/octet-stream',
            }),
          ),
        ),
      )

      for (let i = 0; i < results.length; i++) {
        const result = results[i]
        if (result?.status === 'rejected') {
          console.warn(
            `[ObjectStorage] 上传到 ${this.backends[i]!.name} 失败:`,
            result.reason,
          )
        }
      }
    }

    return {
      key,
      localPath,
      publicLocation: this.getPublicLocation(options.s3Key ?? key),
      size: body.length,
    }
  }

  async deleteObject(key: string, s3Key?: string) {
    const localPath = this.getLocalPath(key)
    await fs.unlink(localPath).catch(() => undefined)

    if (this.backends.length > 0) {
      const remoteKey = s3Key ?? key
      const results = await Promise.allSettled(
        this.backends.map((backend) =>
          backend.client.send(
            new DeleteObjectCommand({
              Bucket: backend.bucket,
              Key: remoteKey,
            }),
          ),
        ),
      )

      for (let i = 0; i < results.length; i++) {
        const result = results[i]
        if (result?.status === 'rejected') {
          console.warn(
            `[ObjectStorage] 从 ${this.backends[i]!.name} 删除失败:`,
            result.reason,
          )
        }
      }
    }
  }

  async exists(key: string) {
    const localPath = this.getLocalPath(key)
    return fsSync.existsSync(localPath)
  }

  sanitizeKeyPart(value: string) {
    return sanitizeKeyPart(value)
  }
}

export const storageService = new ObjectStorageService()
