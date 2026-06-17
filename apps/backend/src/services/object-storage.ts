import fs from 'fs/promises'
import fsSync from 'fs'
import path from 'path'
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'

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

export class ObjectStorageService {
  private readonly provider = (process.env.STORAGE_PROVIDER ?? 'local').toLowerCase()
  private readonly uploadDir = path.resolve(process.cwd(), process.env.UPLOAD_DIR ?? './uploads')
  private readonly bucket = process.env.S3_BUCKET ?? ''
  private readonly endpoint = process.env.S3_ENDPOINT?.trim() || ''
  private readonly region = process.env.S3_REGION?.trim() || 'auto'
  private readonly accessKeyId = process.env.S3_ACCESS_KEY_ID?.trim() || ''
  private readonly secretAccessKey = process.env.S3_SECRET_ACCESS_KEY?.trim() || ''
  private readonly publicBaseUrl = process.env.S3_PUBLIC_BASE_URL?.trim() || ''
  private readonly client: S3Client | null

  constructor() {
    if (this.provider === 's3' || this.provider === 'r2') {
      if (!this.bucket) {
        throw new Error('Missing S3_BUCKET environment variable')
      }

      const config = {
        region: this.region,
        forcePathStyle: this.provider !== 'r2',
        ...(this.endpoint ? { endpoint: this.endpoint } : {}),
        ...(this.accessKeyId && this.secretAccessKey
          ? {
              credentials: {
                accessKeyId: this.accessKeyId,
                secretAccessKey: this.secretAccessKey,
              },
            }
          : {}),
      }

      this.client = new S3Client(config)
      return
    }

    this.client = null
  }

  getProvider() {
    return this.provider
  }

  getLocalPath(key: string) {
    return path.join(this.uploadDir, key)
  }

  getPublicLocation(key: string) {
    if (this.publicBaseUrl) {
      return `${trimTrailingSlash(this.publicBaseUrl)}/${key}`
    }

    if (this.provider === 's3' || this.provider === 'r2') {
      return `s3://${this.bucket}/${key}`
    }

    return `local://${key}`
  }

  async uploadBuffer(key: string, buffer: Buffer | Uint8Array | ArrayBuffer, options: UploadBufferOptions = {}) {
    const body = toBuffer(buffer)
    const localPath = this.getLocalPath(key)

    await fs.mkdir(path.dirname(localPath), { recursive: true })
    await fs.writeFile(localPath, body)

    if (this.client) {
      const remoteKey = options.s3Key ?? key
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: remoteKey,
          Body: body,
          ContentType: options.contentType ?? 'application/octet-stream',
        }),
      )
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

    if (this.client) {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: s3Key ?? key,
        }),
      )
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
