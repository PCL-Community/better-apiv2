import { AdminAuthService, ForbiddenError, UnauthorizedError } from './admin-auth'

function extractBearerToken(authHeader: string | undefined): string {
  if (!authHeader) return ''

  const [scheme, token] = authHeader.split(' ')
  if (scheme?.toLowerCase() !== 'bearer' || !token) return ''
  return token.trim()
}

function extractTokenFromCookie(cookieHeader: string | undefined): string {
  if (!cookieHeader) return ''
  const match = cookieHeader.match(/auth_token=([^;]+)/)
  return match ? (match[1] ?? '').trim() : ''
}

function isGithubPat(token: string): boolean {
  return token.startsWith('ghp_') || token.startsWith('github_pat_')
}

type AdminAuthSuccess = {
  id: string
  githubId: string
  login: string
  name: string | null
  avatarUrl: string | null
  expiresAt: Date | null
}

type AdminAuthError = {
  error: 'unauthorized' | 'forbidden'
  message: string
}

export async function requireAdminByAuthorizationHeader(authHeader: string | undefined) {
  const token = extractBearerToken(authHeader)
  if (token) {
    try {
      if (isGithubPat(token)) {
        return await validatePatAuth(token)
      }
      return await AdminAuthService.getAdminUserByToken(token)
    } catch {
      // fall through to cookie check
    }
  }
  return { error: 'unauthorized', message: '未认证，请先登录' }
}

export async function requireAdmin(
  headers: Record<string, string | undefined>,
): Promise<AdminAuthSuccess | AdminAuthError> {
  let token = extractBearerToken(headers.authorization)

  if (!token) {
    token = extractTokenFromCookie(headers.cookie)
  }

  if (!token) {
    return { error: 'unauthorized', message: '未认证，请先登录' }
  }

  if (isGithubPat(token)) {
    return await validatePatAuth(token)
  }

  try {
    return await AdminAuthService.getAdminUserByToken(token)
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return { error: 'unauthorized', message: '未认证，请先登录' }
    }
    if (error instanceof ForbiddenError) {
      return { error: 'forbidden', message: error.message }
    }
    throw error
  }
}

async function validatePatAuth(
  pat: string,
): Promise<AdminAuthSuccess | AdminAuthError> {
  try {
    const user = await AdminAuthService.validatePat(pat)
    return { ...user, expiresAt: null }
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return { error: 'unauthorized', message: 'GitHub PAT 无效或已过期' }
    }
    if (error instanceof ForbiddenError) {
      return { error: 'forbidden', message: error.message }
    }
    throw error
  }
}
