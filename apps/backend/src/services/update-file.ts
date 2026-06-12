import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { spawn } from "child_process";
import AdmZip from "adm-zip";
import prisma from "./db";
import type { Prisma } from "../../generated/prisma/client";
import { storageService } from "./object-storage";
import type {
  UpdateAsset,
  UpdateRequirements,
  UpdatesResponse,
  CacheResponse,
  ReleaseSourceConfig,
} from "../types/update";
import { PatchJobStatus, VersionChannel } from "../../generated/prisma/enums";
import type { VersionChannel as VersionChannelType } from "../../generated/prisma/enums";

// ─── Types ───────────────────────────────────────────────────────────────────

type CreateUpdateInput = {
  file: File;
  fileName?: string;
  channel: string;
  versionName: string;
  versionCode: number;
  sourceGroup?: string;
  changelog: string;
  uploadedByAdmin: string;
  required: UpdateRequirements;
  skipChannelDetection?: boolean;
};

type UpdateMetadataInput = {
  fileName?: string;
  channel: string;
  versionName: string;
  versionCode: number;
  sourceGroup?: string;
  changelog: string;
  required: UpdateRequirements;
};

type BatchReleaseInput = {
  versionName: string
  versionCode: number
  sourceGroup?: string
  changelog: string
  uploadedByAdmin: string
  required: UpdateRequirements
  fileChannels: { file: File; channel: string }[]
};

type UpdateChannelKey = "frarm64" | "frx64" | "srarm64" | "srx64";

// ─── Channel Constants ──────────────────────────────────────────────────────

const channelMap: Record<UpdateChannelKey, VersionChannelType> = {
  frarm64: VersionChannel.FRARM64,
  frx64: VersionChannel.FRX64,
  srarm64: VersionChannel.SRARM64,
  srx64: VersionChannel.SRX64,
};

const channelLabelMap: Record<
  VersionChannelType,
  UpdateAsset["version"]["channel"]
> = {
  [VersionChannel.FRARM64]: "frarm64",
  [VersionChannel.FRX64]: "frx64",
  [VersionChannel.SRARM64]: "srarm64",
  [VersionChannel.SRX64]: "srx64",
};

/**
 * Channel detection keywords matching the Python UpdateService's
 * channel_rules.json convention.
 *
 * main_name:  fr = Beta (预发布),  sr = Release (正式版)
 * sub_name:   arm64 = ARM64,       x64 = x64
 */
const channelKeywordMap: Record<
  UpdateChannelKey,
  { main: string; sub: string }
> = {
  frarm64: { main: "Beta", sub: "ARM64" },
  frx64: { main: "Beta", sub: "x64" },
  srarm64: { main: "Release", sub: "ARM64" },
  srx64: { main: "Release", sub: "x64" },
};

const patchConcurrency = Math.max(
  1,
  Number(process.env.PATCH_CONCURRENCY ?? "2"),
);
const tempRoot = path.resolve(
  process.cwd(),
  process.env.UPLOAD_DIR ?? "./uploads",
  "_tmp",
);

// ─── Utility Functions ──────────────────────────────────────────────────────

function formatDateTime(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function normalizeChannel(channel?: string): UpdateChannelKey {
  const normalized = String(channel ?? "frarm64").toLowerCase();
  return normalized in channelMap
    ? (normalized as UpdateChannelKey)
    : "frarm64";
}

function toBuffer(file: File) {
  return file.arrayBuffer().then((value) => Buffer.from(value));
}

function hashBuffer(buffer: Buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function md5Hash(content: string) {
  return crypto.createHash("md5").update(content, "utf-8").digest("hex");
}

function normalizeRequirements(input: UpdateRequirements): UpdateRequirements {
  const dotnet = Number(input.dotnet);
  const windows = String(input.windows ?? "").trim();

  if (!Number.isInteger(dotnet) || dotnet <= 0) {
    throw new Error("Missing required .NET version");
  }

  if (!windows) {
    throw new Error("Missing required Windows version");
  }

  return {
    dotnet,
    windows,
  };
}

function joinUrl(baseUrl: string | undefined, routePath: string) {
  if (!baseUrl) return routePath;
  return new URL(routePath, baseUrl).toString();
}

function buildUpdateStorageKey(params: {
  fileName: string;
  channel: string;
  versionCode: number;
  sha256: string;
  originalName: string;
}) {
  const safeFileName = storageService.sanitizeKeyPart(params.fileName);
  return `updates/${params.channel}/${safeFileName}/${params.versionCode}-${params.sha256.slice(0, 16)}/${params.sha256}.zip`;
}

function buildPatchStorageKey(params: {
  channel: string;
  sourceVersionCode: number;
  targetVersionCode: number;
  sourceFileName: string;
  targetFileName: string;
  patchSha256: string;
}) {
  const safeSource = storageService.sanitizeKeyPart(params.sourceFileName);
  const safeTarget = storageService.sanitizeKeyPart(params.targetFileName);
  return `patches/${params.channel}/${params.sourceVersionCode}-to-${params.targetVersionCode}/${safeSource}-${safeTarget}-${params.patchSha256.slice(0, 16)}.patch`;
}

async function ensureTempRoot() {
  await fs.mkdir(tempRoot, { recursive: true });
}

async function runBsdiff(oldPath: string, newPath: string, patchPath: string) {
  const command = process.env.BSDIFF_COMMAND?.trim() || "bsdiff";
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, [oldPath, newPath, patchPath], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      reject(error);
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(`bsdiff exited with code ${code ?? "unknown"}: ${stderr}`),
      );
    });
  });
}

async function runLimited<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
) {
  const queue = [...items];
  const runners = Array.from(
    { length: Math.min(limit, queue.length) },
    async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (!item) return;
        await worker(item);
      }
    },
  );
  await Promise.all(runners);
}

// ─── ReleaseSourceService ───────────────────────────────────────────────────

export class ReleaseSourceService {
  /** List all enabled release sources, optionally filtered by group */
  static async listSources(groupName?: string): Promise<ReleaseSourceConfig[]> {
    const where = groupName ? { groupName, enabled: true } : {};
    return prisma.releaseSource.findMany({
      where,
      orderBy: { createdAt: "asc" },
    });
  }

  /** Create a new release source */
  static async createSource(input: {
    name: string;
    baseUrl: string;
    groupName: string;
  }) {
    return prisma.releaseSource.create({ data: input });
  }

  /** Update a release source */
  static async updateSource(
    id: string,
    input: Partial<{
      name: string;
      baseUrl: string;
      groupName: string;
      enabled: boolean;
    }>,
  ) {
    return prisma.releaseSource.update({ where: { id }, data: input });
  }

  /** Delete a release source */
  static async deleteSource(id: string) {
    return prisma.releaseSource.delete({ where: { id } });
  }

  /** Get download URLs for a source group */
  static async getDownloadUrls(
    sha256: string,
    groupName: string,
  ): Promise<string[]> {
    const sources = await prisma.releaseSource.findMany({
      where: { groupName, enabled: true },
    });
    if (sources.length === 0) return [];
    return sources.map(
      (s) => `${s.baseUrl.replace(/\/+$/, "")}/static/raw/${sha256}.zip`,
    );
  }

  /** Get patch download URLs for a source group */
  static async getPatchDownloadUrls(
    filename: string,
    groupName: string,
  ): Promise<string[]> {
    const sources = await prisma.releaseSource.findMany({
      where: { groupName, enabled: true },
    });
    if (sources.length === 0) return [];
    return sources.map(
      (s) => `${s.baseUrl.replace(/\/+$/, "")}/static/patch/${filename}`,
    );
  }
}

// ─── UpdateService ──────────────────────────────────────────────────────────

export class UpdateService {
  // ── Channel Detection ───────────────────────────────────────────────────

  /**
   * Detect channel from a filename using keyword matching.
   * Mirrors the Python `deserialize_local_files` logic.
   *
   * Example: "PCL-CE-Beta-ARM64.exe" → frarm64
   */
  static detectChannel(fileName: string): UpdateChannelKey | null {
    const name = fileName;
    for (const [channel, { main, sub }] of Object.entries(channelKeywordMap)) {
      if (name.includes(main) && name.includes(sub)) {
        return channel as UpdateChannelKey;
      }
    }
    return null;
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /**
   * Get all update assets for a given channel.
   * Returns the latest version first, with source group download URLs
   * and bidirectional patch references.
   */
  static async getUpdatesByChannel(
    channel?: string,
    baseUrl?: string,
  ): Promise<UpdatesResponse> {
    const channelKey = channel ? normalizeChannel(channel) : undefined;
    const dbChannel = channelKey ? channelMap[channelKey] : undefined;

    if (!dbChannel) {
      return { assets: [] };
    }

    const query = {
      include: {
        generatedPatches: {
          include: { fromUpdateFile: { select: { sha256: true, id: true } } },
          orderBy: { createdAt: "desc" as const },
        },
        sourcePatches: {
          include: { toUpdateFile: { select: { sha256: true, id: true } } },
          orderBy: { createdAt: "desc" as const },
        },
      },
    } as const;

    const latest = await prisma.updateFile.findFirst({
      ...query,
      where: { channel: dbChannel },
      orderBy: [{ versionCode: "desc" }, { uploadedAt: "desc" }],
    }) as Prisma.UpdateFileGetPayload<typeof query> | null;

    if (!latest) {
      return { assets: [] };
    }

    const assets = [latest];
    const content: UpdateAsset[] = await Promise.all(
      assets.map(async (asset) => {
        const channelLabel = channelLabelMap[asset.channel];

        // Build download URLs: always use the local download endpoint which will redirect
        const downloads: string[] = [
          joinUrl(baseUrl, `/apiv2/updates/${asset.id}/download`),
        ];

        // Build patches list: patches TO this version + patches FROM this version
        const patches: string[] = [];
        for (const patch of asset.generatedPatches) {
          // fromUpdate → this (toUpdate)
          patches.push(`${patch.fromUpdateFile.sha256}_${asset.sha256}.patch`);
        }
        for (const patch of asset.sourcePatches) {
          // this (fromUpdate) → toUpdate
          patches.push(`${asset.sha256}_${patch.toUpdateFile.sha256}.patch`);
        }

        return {
          id: asset.id,
          file_name: asset.fileName,
          required: {
            dotnet: asset.requiredDotnet,
            windows: asset.requiredWindows,
          },
          version: {
            channel: channelLabel,
            name: asset.versionName,
            code: asset.versionCode,
          },
          upd_time: formatDateTime(asset.uploadedAt),
          downloads,
          patches,
          sha256: asset.sha256,
          changelog: asset.changelog,
        };
      }),
    );

    return { assets: content };
  }

  /**
   * Get all update assets across every channel.
   */
  static async getAllUpdates(baseUrl?: string): Promise<UpdatesResponse> {
    const query = {
      include: {
        generatedPatches: {
          include: { fromUpdateFile: { select: { sha256: true, id: true } } },
          orderBy: { createdAt: "desc" as const },
        },
        sourcePatches: {
          include: { toUpdateFile: { select: { sha256: true, id: true } } },
          orderBy: { createdAt: "desc" as const },
        },
      },
    } as const;

    const updates = await prisma.updateFile.findMany({
      ...query,
      orderBy: [{ versionCode: "desc" }, { uploadedAt: "desc" }],
    }) as Prisma.UpdateFileGetPayload<typeof query>[];

    const assets: UpdateAsset[] = await Promise.all(
      updates.map(async (asset) => {
        const channelLabel = channelLabelMap[asset.channel];
        const downloads: string[] = [
          joinUrl(baseUrl, `/apiv2/updates/${asset.id}/download`),
        ];

        const patches: string[] = [];
        for (const patch of asset.generatedPatches) {
          patches.push(`${patch.fromUpdateFile.sha256}_${asset.sha256}.patch`);
        }
        for (const patch of asset.sourcePatches) {
          patches.push(`${asset.sha256}_${patch.toUpdateFile.sha256}.patch`);
        }

        return {
          id: asset.id,
          file_name: asset.fileName,
          required: {
            dotnet: asset.requiredDotnet,
            windows: asset.requiredWindows,
          },
          version: {
            channel: channelLabel,
            name: asset.versionName,
            code: asset.versionCode,
          },
          upd_time: formatDateTime(asset.uploadedAt),
          downloads,
          patches,
          sha256: asset.sha256,
          changelog: asset.changelog,
        };
      }),
    );

    return { assets };
  }

  // ── Cache Generation ────────────────────────────────────────────────────

  /**
   * Generate a cache.json response containing MD5 hashes of all update files.
   * Mirrors the Python `update_source_cache_file_v2` logic.
   */
  static async computeCache(baseUrl?: string): Promise<CacheResponse> {
    const allChannels: UpdateChannelKey[] = [
      "frarm64",
      "frx64",
      "srarm64",
      "srx64",
    ];
    const cache: CacheResponse = {};

    for (const ch of allChannels) {
      const result = await this.getUpdatesByChannel(ch, baseUrl);
      const jsonStr = JSON.stringify(result);
      cache[`updates-${ch}`] = md5Hash(jsonStr);
      cache[ch] = md5Hash(jsonStr);
    }

    // Announcement cache: hash the announcement JSON
    const announcements = await prisma.announcement.findMany({
      orderBy: { createdAt: "desc" },
    });
    const announcementJson = JSON.stringify({ content: announcements });
    cache["announcement"] = md5Hash(announcementJson);

    return cache;
  }

  // ── Admin: Create ───────────────────────────────────────────────────────

  /**
   * Create a new update from a single file upload.
   * Automatically detects channel from filename if not provided.
   */
  static async createUpdateFromUpload(input: CreateUpdateInput) {
    const fileName = (input.fileName?.trim() || input.file.name).trim();
    if (!fileName) throw new Error("Missing file name");

    // Auto-detect channel from filename if not explicitly provided or unclear
    let channel = normalizeChannel(input.channel);
    const detected = this.detectChannel(fileName);
    if (
      !input.skipChannelDetection &&
      detected &&
      (!input.channel || input.channel === "frarm64")
    ) {
      channel = detected;
    }

    const versionName = input.versionName.trim();
    const changelog = input.changelog.trim();
    const required = normalizeRequirements(input.required);
    if (!versionName) throw new Error("Missing version name");

    const fileBuffer = await toBuffer(input.file);
    const sha256 = hashBuffer(fileBuffer);
    const s3Key = buildUpdateStorageKey({
      fileName,
      channel,
      versionCode: input.versionCode,
      sha256,
      originalName: input.file.name,
    });

    const zip = new AdmZip();
    zip.addFile("Plain Craft Launcher Community Edition.exe", fileBuffer);
    const zipBuffer = zip.toBuffer();

    const existing = await prisma.updateFile.findFirst({
      where: {
        channel: channelMap[channel],
        versionCode: input.versionCode,
      },
    });
    if (existing) throw new Error("Update version already exists");

    const stored = await storageService.uploadBuffer(s3Key, zipBuffer, {
      contentType: "application/zip",
    });

    const updateFile = await prisma.updateFile.create({
      data: {
        fileName,
        channel: channelMap[channel],
        versionName,
        versionCode: input.versionCode,
        requiredDotnet: required.dotnet,
        requiredWindows: required.windows,
        originalName: input.file.name,
        fileSize: fileBuffer.length,
        sha256,
        s3Key: stored.key,
        s3Url: stored.publicLocation,
        sourceGroup: input.sourceGroup?.trim() || null,
        changelog,
        uploadedByAdmin: input.uploadedByAdmin,
      },
    });

    // Create patch jobs for ALL previous versions in the same channel
    const allPrevVersions = await prisma.updateFile.findMany({
      where: {
        channel: channelMap[channel],
        id: { not: updateFile.id },
      },
      orderBy: { versionCode: "asc" },
    });

    if (allPrevVersions.length > 0) {
      await prisma.patchJobQueue.createMany({
        data: allPrevVersions.map((prev) => ({
          updateFileId: updateFile.id,
          status: PatchJobStatus.PENDING,
          sourceVersionCode: prev.versionCode,
          targetVersionCode: input.versionCode,
        })),
      });

      void this.runPatchJobsForUpdate(updateFile.id).catch((error) => {
        console.error("后台补丁生成失败:", error);
      });
    }

    return updateFile;
  }

  // ── Admin: Batch Release ────────────────────────────────────────────────

  /**
   * Batch release: upload multiple files for the same version across channels.
   * Mirrors the Python `start_release_file_process_v2` workflow.
   */
  static async batchRelease(input: BatchReleaseInput) {
    const results: Awaited<ReturnType<typeof prisma.updateFile.create>>[] = [];
    const required = normalizeRequirements(input.required);

    for (const { file, channel } of input.fileChannels) {
      const normalized = normalizeChannel(channel);
      const result = await this.createUpdateFromUpload({
        file,
        fileName: file.name,
        channel: normalized,
        versionName: input.versionName,
        versionCode: input.versionCode,
        ...(input.sourceGroup ? { sourceGroup: input.sourceGroup } : {}),
        changelog: input.changelog,
        uploadedByAdmin: input.uploadedByAdmin,
        required,
        skipChannelDetection: true,
      });
      results.push(result);
    }

    return results;
  }

  // ── Admin: Update Metadata ──────────────────────────────────────────────

  static async updateMetadata(id: string, input: UpdateMetadataInput) {
    const channel = normalizeChannel(input.channel);
    const required = normalizeRequirements(input.required);
    return prisma.updateFile.update({
      where: { id },
      data: {
        ...(input.fileName?.trim() ? { fileName: input.fileName.trim() } : {}),
        channel: channelMap[channel],
        versionName: input.versionName.trim(),
        versionCode: input.versionCode,
        requiredDotnet: required.dotnet,
        requiredWindows: required.windows,
        sourceGroup: input.sourceGroup?.trim() ?? null,
        changelog: input.changelog.trim(),
      },
    });
  }

  // ── Admin: Delete ───────────────────────────────────────────────────────

  static async deleteUpdate(id: string) {
    const updateFile = await prisma.updateFile.findUnique({
      where: { id },
      include: { generatedPatches: true, sourcePatches: true },
    });
    if (!updateFile) throw new Error("Update file not found");

    const keysToDelete = [
      updateFile.s3Key,
      ...updateFile.generatedPatches.map((p) => p.s3Key),
      ...updateFile.sourcePatches.map((p) => p.s3Key),
    ];

    await prisma.patchJobQueue.deleteMany({ where: { updateFileId: id } });
    await prisma.patchFile.deleteMany({
      where: { OR: [{ fromUpdateFileId: id }, { toUpdateFileId: id }] },
    });
    await prisma.updateFile.delete({ where: { id } });

    for (const key of keysToDelete) {
      await storageService.deleteObject(key).catch((error) => {
        console.warn(`删除存储对象失败: ${key}`, error);
      });
    }
  }

  // ── Patch Generation ────────────────────────────────────────────────────

  static async runPatchJobsForUpdate(updateFileId: string) {
    const jobs = await prisma.patchJobQueue.findMany({
      where: { updateFileId, status: PatchJobStatus.PENDING },
      orderBy: { targetVersionCode: "asc" },
    });
    await runLimited(jobs, patchConcurrency, async (job) => {
      await this.processPatchJob(job.id);
    });
  }

  static async processPatchJob(jobId: string) {
    const job = await prisma.patchJobQueue.findUnique({
      where: { id: jobId },
      include: { updateFile: true },
    });
    if (!job || job.status !== PatchJobStatus.PENDING) return;

    const source = await prisma.updateFile.findFirst({
      where: {
        channel: job.updateFile.channel,
        versionCode: job.sourceVersionCode,
      },
    });
    if (!source) {
      await prisma.patchJobQueue.update({
        where: { id: job.id },
        data: {
          status: PatchJobStatus.FAILED,
          errorMessage: `未找到旧版本 ${job.sourceVersionCode}`,
          startedAt: job.startedAt ?? new Date(),
          completedAt: new Date(),
        },
      });
      return;
    }

    const existingPatch = await prisma.patchFile.findUnique({
      where: {
        fromUpdateFileId_toUpdateFileId: {
          fromUpdateFileId: source.id,
          toUpdateFileId: job.updateFileId,
        },
      },
    });
    if (existingPatch) {
      await prisma.patchJobQueue.update({
        where: { id: job.id },
        data: {
          status: PatchJobStatus.SUCCESS,
          startedAt: job.startedAt ?? new Date(),
          completedAt: new Date(),
        },
      });
      return;
    }

    const sourcePath = storageService.getLocalPath(source.s3Key);
    const targetPath = storageService.getLocalPath(job.updateFile.s3Key);

    await ensureTempRoot();

    // Extract EXEs from the zips to compute patches
    const sourceExePath = path.join(tempRoot, `source-${source.id}-${Date.now()}.exe`);
    const targetExePath = path.join(tempRoot, `target-${job.updateFile.id}-${Date.now()}.exe`);
    
    try {
      const sourceZip = new AdmZip(sourcePath);
      const sourceExe = sourceZip.readFile("Plain Craft Launcher Community Edition.exe");
      if (!sourceExe) throw new Error("Invalid source zip: missing executable");
      await fs.writeFile(sourceExePath, sourceExe);

      const targetZip = new AdmZip(targetPath);
      const targetExe = targetZip.readFile("Plain Craft Launcher Community Edition.exe");
      if (!targetExe) throw new Error("Invalid target zip: missing executable");
      await fs.writeFile(targetExePath, targetExe);
    } catch (error) {
      await prisma.patchJobQueue.update({
        where: { id: job.id },
        data: {
          status: PatchJobStatus.FAILED,
          errorMessage: error instanceof Error ? error.message : String(error),
          startedAt: job.startedAt ?? new Date(),
          completedAt: new Date(),
        },
      });
      return;
    }

    const patchPath = path.join(
      tempRoot,
      `${source.id}-${job.updateFile.id}-${Date.now()}.patch`,
    );

    await prisma.patchJobQueue.update({
      where: { id: job.id },
      data: {
        status: PatchJobStatus.PROCESSING,
        startedAt: job.startedAt ?? new Date(),
      },
    });

    try {
      await runBsdiff(sourceExePath, targetExePath, patchPath);

      const patchBuffer = await fs.readFile(patchPath);
      const patchSha256 = hashBuffer(patchBuffer);
      const patchKey = buildPatchStorageKey({
        channel: channelLabelMap[job.updateFile.channel],
        sourceVersionCode: source.versionCode,
        targetVersionCode: job.updateFile.versionCode,
        sourceFileName: source.fileName,
        targetFileName: job.updateFile.fileName,
        patchSha256,
      });

      const storedPatch = await storageService.uploadBuffer(
        patchKey,
        patchBuffer,
        {
          contentType: "application/octet-stream",
        },
      );

      await prisma.patchFile.create({
        data: {
          fromUpdateFileId: source.id,
          toUpdateFileId: job.updateFile.id,
          patchFileSize: patchBuffer.length,
          patchSha256,
          s3Key: storedPatch.key,
          s3Url: storedPatch.publicLocation,
        },
      });

      await prisma.patchJobQueue.update({
        where: { id: job.id },
        data: {
          status: PatchJobStatus.SUCCESS,
          completedAt: new Date(),
          errorMessage: null,
        },
      });
    } catch (error) {
      await prisma.patchJobQueue.update({
        where: { id: job.id },
        data: {
          status: PatchJobStatus.FAILED,
          errorMessage: error instanceof Error ? error.message : String(error),
          completedAt: new Date(),
        },
      });
      throw error;
    } finally {
      await fs.unlink(patchPath).catch(() => undefined);
      await fs.unlink(sourceExePath).catch(() => undefined);
      await fs.unlink(targetExePath).catch(() => undefined);
    }
  }

  // ── File Downloads ──────────────────────────────────────────────────────

  static async getUpdateDownloadPath(id: string) {
    const updateFile = await prisma.updateFile.findUnique({ where: { id } });
    if (!updateFile) return null;
    return storageService.getLocalPath(updateFile.s3Key);
  }

  static async getUpdateDownloadPathAndSha(id: string) {
    const updateFile = await prisma.updateFile.findUnique({ where: { id } });
    if (!updateFile) return null;
    return {
      filePath: storageService.getLocalPath(updateFile.s3Key),
      sha256: updateFile.sha256,
    };
  }

  static async getUpdateRedirectUrl(id: string): Promise<string | null> {
    const updateFile = await prisma.updateFile.findUnique({ where: { id } });
    if (!updateFile) return null;

    if (updateFile.sourceGroup) {
      const mirrorUrls = await ReleaseSourceService.getDownloadUrls(
        updateFile.sha256,
        updateFile.sourceGroup
      );
      if (mirrorUrls.length > 0) {
        return mirrorUrls[Math.floor(Math.random() * mirrorUrls.length)] ?? null;
      }
    }

    if (updateFile.s3Url.startsWith("http")) {
      return updateFile.s3Url;
    }

    const { API_URL } = process.env;
    if (API_URL && updateFile.s3Url.startsWith("/")) {
      return `${API_URL.replace(/\/+$/, "")}${updateFile.s3Url}`;
    }

    // fallback when no mirrors available and not external S3
    return null;
  }

  static async getPatchDownloadInfo(id: string) {
    const patchFile = await prisma.patchFile.findUnique({
      where: { id },
      include: { fromUpdateFile: true },
    });
    if (!patchFile) return null;
    return {
      filePath: storageService.getLocalPath(patchFile.s3Key),
      fileName: `${patchFile.fromUpdateFile.sha256}_${patchFile.patchSha256.slice(0, 16)}.patch`,
    };
  }

  static async getPatchDownloadInfoBySha256(oldSha256: string, newSha256: string) {
    const patchFile = await prisma.patchFile.findFirst({
      where: {
        fromUpdateFile: { sha256: oldSha256 },
        toUpdateFile: { sha256: newSha256 },
      },
      include: { fromUpdateFile: true },
    });
    if (!patchFile) return null;
    return {
      filePath: storageService.getLocalPath(patchFile.s3Key),
      fileName: `${patchFile.fromUpdateFile.sha256}_${patchFile.patchSha256.slice(0, 16)}.patch`,
    };
  }

  static async getPatchS3UrlBySha256(oldSha256: string, newSha256: string) {
    const patchFile = await prisma.patchFile.findFirst({
      where: {
        fromUpdateFile: { sha256: oldSha256 },
        toUpdateFile: { sha256: newSha256 },
      },
      select: { s3Url: true },
    });
    return patchFile?.s3Url || null;
  }

  static async getPatchRedirectUrlBySha256(oldSha256: string, newSha256: string): Promise<string | null> {
    const patchFile = await prisma.patchFile.findFirst({
      where: {
        fromUpdateFile: { sha256: oldSha256 },
        toUpdateFile: { sha256: newSha256 },
      },
      include: {
        fromUpdateFile: { select: { sourceGroup: true } },
        toUpdateFile: { select: { sourceGroup: true } },
      },
    });
    if (!patchFile) return null;

    const groupName = patchFile.toUpdateFile.sourceGroup ?? patchFile.fromUpdateFile.sourceGroup;
    if (groupName) {
      const filename = `${oldSha256}_${newSha256}.patch`;
      const mirrorUrls = await ReleaseSourceService.getPatchDownloadUrls(filename, groupName);
      if (mirrorUrls.length > 0) {
        return mirrorUrls[Math.floor(Math.random() * mirrorUrls.length)] ?? null;
      }
    }

    if (patchFile.s3Url.startsWith("http")) {
      return patchFile.s3Url;
    }

    const { API_URL } = process.env;
    if (API_URL && patchFile.s3Url.startsWith("/")) {
      return `${API_URL.replace(/\/+$/, "")}${patchFile.s3Url}`;
    }

    return null;
  }
}
