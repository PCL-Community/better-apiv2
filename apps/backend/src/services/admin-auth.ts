import prisma from './db'
import {
  checkGithubTeamMembership,
  exchangeCodeForAccessToken,
  fetchGithubUserProfile,
} from './github-auth'

const DEFAULT_SESSION_TTL_HOURS = 24

function getSessionTtlHours(): number {
  const raw = process.env.ADMIN_SESSION_TTL_HOURS
  if (!raw) return DEFAULT_SESSION_TTL_HOURS

  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_SESSION_TTL_HOURS
  return parsed
}

export class ForbiddenError extends Error {}
export class UnauthorizedError extends Error {}

export class AdminAuthService {
  static async loginWithGithubCode(code: string) {
    const githubAccessToken = await exchangeCodeForAccessToken(code)
    const profile = await fetchGithubUserProfile(githubAccessToken)
    const isTeamMember = await checkGithubTeamMembership(githubAccessToken, profile.login)

    const user = await prisma.adminUser.upsert({
      where: { githubId: String(profile.id) },
      update: {
        login: profile.login,
        name: profile.name,
        avatarUrl: profile.avatar_url,
        isTeamMember,
      },
      create: {
        githubId: String(profile.id),
        login: profile.login,
        name: profile.name,
        avatarUrl: profile.avatar_url,
        isTeamMember,
      },
    })

    if (!isTeamMember) {
      throw new ForbiddenError('Only PCL-Community/ce-dev members can use admin API')
    }

    const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')
    const expiresAt = new Date(Date.now() + getSessionTtlHours() * 60 * 60 * 1000)

    await prisma.adminSession.create({
      data: {
        token,
        userId: user.id,
        expiresAt,
      },
    })

    return {
      token,
      expiresAt,
      user: {
        id: user.id,
        githubId: user.githubId,
        login: user.login,
        name: user.name,
        avatarUrl: user.avatarUrl,
      },
    }
  }

  static async getAdminUserByToken(token: string) {
    if (!token) {
      throw new UnauthorizedError('Missing token')
    }

    const session = await prisma.adminSession.findUnique({
      where: { token },
      include: {
        user: true,
      },
    })

    if (!session) {
      throw new UnauthorizedError('Invalid token')
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      await prisma.adminSession.delete({ where: { id: session.id } }).catch(() => undefined)
      throw new UnauthorizedError('Token expired')
    }

    if (!session.user.isTeamMember) {
      throw new ForbiddenError('User is not a PCL-Community/ce-dev member')
    }

    return {
      id: session.user.id,
      githubId: session.user.githubId,
      login: session.user.login,
      name: session.user.name,
      avatarUrl: session.user.avatarUrl,
      expiresAt: session.expiresAt,
    }
  }

  static async logout(token: string) {
    await prisma.adminSession.deleteMany({
      where: { token },
    })
  }
}
