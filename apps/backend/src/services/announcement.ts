import prisma from './db'
import { cacheGet, cacheSet, invalidateAnnouncementsCache, CacheKeys } from './redis'
import type {
  Announcement,
  AnnouncementButton,
  AnnouncementInput,
  AnnouncementResponse,
  AnnouncementSkip,
} from '../types/announcement'

type AnnouncementRecord = Awaited<
  ReturnType<typeof prisma.announcement.findMany>
>[number] & {
  button1?: { text: string; command: string; commandParameter: string } | null
  button2?: { text: string; command: string; commandParameter: string } | null
}

function parseJsonObject<T>(value: string | null | undefined): T | null {
  if (!value) {
    return null
  }

  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

function normalizeAnnouncementDate(date: Date) {
  const formatted = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date)

  return `${formatted.replace(' ', ' ')}+08:00`
}

function normalizeSkip(skip: unknown): AnnouncementSkip | null {
  if (!skip || typeof skip !== 'object') {
    return null
  }

  const record = skip as AnnouncementSkip

  if (!record.min && !record.max && !record.notBefore && !record.notAfter) {
    return null
  }

  return {
    min: record.min ?? null,
    max: record.max ?? null,
    notBefore: record.notBefore ?? null,
    notAfter: record.notAfter ?? null,
  }
}

function normalizeExecValue(exec: string | undefined): string {
  const value = String(exec ?? '').trim()

  if (!value) {
    return 'OpenWebsite'
  }

  return value === 'OpenWebSite' || value === 'OPEN_URL' || value === 'OPEN_WEBPAGE'
    ? 'OpenWebsite'
    : value
}

function normalizeButton(button: unknown): AnnouncementButton | null {
  if (!button || typeof button !== 'object') {
    return null
  }

  const record = button as Partial<AnnouncementButton> & {
    command?: string
    commandParameter?: string
    command_parameter?: string
    command_paramter?: string
    argument?: string
    exec?: string
  }

  const text = String(record.text ?? '').trim()
  const exec = String(record.exec ?? record.command ?? '').trim()
  const argument = String(
    record.argument ??
      record.commandParameter ??
      record.command_parameter ??
      record.command_paramter ??
      '',
  ).trim()

  if (!text && !exec && !argument) {
    return null
  }

  return {
    text,
    exec: normalizeExecValue(exec),
    argument,
  }
}

function mapLegacyButton(button?: { text: string; command: string; commandParameter: string } | null): AnnouncementButton | null {
  if (!button) {
    return null
  }

  return {
    text: button.text,
    exec: normalizeExecValue(button.command === 'OPEN_URL' || button.command === 'OPEN_WEBPAGE' ? 'OpenWebsite' : button.command),
    argument: button.commandParameter,
  }
}

function getButtons(record: AnnouncementRecord): AnnouncementButton[] {
  const parsedButtons = parseJsonObject<AnnouncementButton[]>(record.buttons)

  if (Array.isArray(parsedButtons)) {
    return parsedButtons.map(normalizeButton).filter((button): button is AnnouncementButton => Boolean(button))
  }

  return [mapLegacyButton(record.button1), mapLegacyButton(record.button2)].filter((button): button is AnnouncementButton => Boolean(button))
}

function toAnnouncement(record: AnnouncementRecord): Announcement {
  const details = record.details ?? record.detail
  const priority = record.priority ?? 0
  const level = record.level ?? 0
  const skip = normalizeSkip(parseJsonObject<AnnouncementSkip>(record.skip))

  return {
    id: record.id,
    title: record.title,
    details,
    priority,
    level,
    date: normalizeAnnouncementDate(record.date),
    skip,
    buttons: getButtons(record),
  }
}

export class AnnouncementService {
  /**
   * 获取所有公告
   */
  static async getAnnouncements(): Promise<AnnouncementResponse> {
    const cacheKey = CacheKeys.announcements()
    const cached = await cacheGet<AnnouncementResponse>(cacheKey)
    if (cached) return cached

    const announcements = await prisma.announcement.findMany({
      include: {
        button1: true,
        button2: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    const result = announcements.map((announcement) => toAnnouncement(announcement as AnnouncementRecord))
    await cacheSet(cacheKey, result)
    return result
  }

  /**
   * 创建公告
   */
  static async createAnnouncement(data: AnnouncementInput) {
    const details = data.details ?? data.detail ?? ''
    const createData = {
      title: data.title,
      detail: details,
      details,
      priority: data.priority ?? 0,
      level: data.level ?? 0,
      skip: data.skip ? JSON.stringify(data.skip) : null,
      buttons: data.buttons ? JSON.stringify(data.buttons.map(normalizeButton).filter((button): button is AnnouncementButton => Boolean(button))) : null,
      date: data.date,
    }

    const result = await prisma.announcement.create({
      data: createData,
      include: {
        button1: true,
        button2: true,
      },
    })

    await invalidateAnnouncementsCache()
    return result
  }

  /**
   * 更新公告
   */
  static async updateAnnouncement(id: string, data: AnnouncementInput) {
    const details = data.details ?? data.detail ?? ''
    const updateData: Record<string, unknown> = {
      title: data.title,
      detail: details,
      details,
      priority: data.priority ?? 0,
      level: data.level ?? 0,
      skip: data.skip ? JSON.stringify(data.skip) : null,
      buttons: data.buttons ? JSON.stringify(data.buttons.map(normalizeButton).filter((button): button is AnnouncementButton => Boolean(button))) : null,
      date: data.date,
    }

    const result = await prisma.announcement.update({
      where: { id },
      data: updateData,
      include: {
        button1: true,
        button2: true,
      },
    })

    await invalidateAnnouncementsCache()
    return result
  }

  /**
   * 删除公告
   */
  static async deleteAnnouncement(id: string) {
    const result = await prisma.announcement.delete({
      where: { id },
    })

    await invalidateAnnouncementsCache()
    return result
  }
}
