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

export async function requireAdminByAuthorizationHeader(authHeader: string | undefined) {
  const token = extractBearerToken(authHeader)
  if (token) {
    try {
      return await AdminAuthService.getAdminUserByToken(token)
    } catch {
      // fall through to cookie check
    }
  }
  return { error: 'unauthorized', message: '未认证，请先登录' }
}

export async function requireAdmin(headers: Record<string, string | undefined>) {
  // Try Bearer token first
  let token = extractBearerToken(headers.authorization)

  // Fall back to cookie
  if (!token) {
    token = extractTokenFromCookie(headers.cookie)
  }

  if (!token) {
    return { error: 'unauthorized', message: '未认证，请先登录' }
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
