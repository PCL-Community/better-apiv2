import { Elysia } from 'elysia'
import { AdminAuthService, ForbiddenError } from '../services/admin-auth'
import { getGithubOAuthLoginUrl, storeOAuthState, validateOAuthState } from '../services/github-auth'
import { createRateLimiter, getClientIp } from '../services/rate-limiter'

const authRateLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: 20 })

function setAuthCookie(set: any, token: string, expiresAt: Date) {
  const maxAge = Math.floor((expiresAt.getTime() - Date.now()) / 1000)
  set.headers['Set-Cookie'] =
    `auth_token=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.max(0, maxAge)}`
}

function clearAuthCookie(set: any) {
  set.headers['Set-Cookie'] = 'auth_token=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'
}

export const authRoutes = new Elysia({ prefix: '/auth/github' })
  .get('/login', async ({ query, set, request }) => {
    const clientIp = getClientIp(request)
    const rateCheck = authRateLimiter(clientIp)
    if (!rateCheck.allowed) {
      set.status = 429
      return { success: false, error: '请求过于频繁，请稍后再试' }
    }

    try {
      const state = typeof query.state === 'string' ? query.state : crypto.randomUUID()
      await storeOAuthState(state)
      const loginUrl = getGithubOAuthLoginUrl(state)

      return new Response(null, {
        status: 302,
        headers: {
          Location: loginUrl,
        },
      })
    } catch {
      set.status = 500
      return { success: false, error: '登录服务不可用' }
    }
  })
  .get('/callback', async ({ query, set, request }) => {
    const clientIp = getClientIp(request)
    const rateCheck = authRateLimiter(clientIp)
    if (!rateCheck.allowed) {
      set.status = 429
      return { success: false, error: '请求过于频繁，请稍后再试' }
    }

    const code = typeof query.code === 'string' ? query.code : ''
    const state = typeof query.state === 'string' ? query.state : ''

    if (!code) {
      set.status = 400
      return { success: false, error: '缺少 OAuth 授权码' }
    }

    if (!state || !(await validateOAuthState(state))) {
      set.status = 403
      return { success: false, error: '请求校验失败，请重新登录' }
    }

    try {
      const result = await AdminAuthService.loginWithGithubCode(code)
      setAuthCookie(set, result.token, result.expiresAt)
      return {
        success: true,
        token: result.token,
        expiresAt: result.expiresAt,
        user: result.user,
      }
    } catch (error) {
      if (error instanceof ForbiddenError) {
        set.status = 403
        return { success: false, error: error.message }
      }

      set.status = 401
      return { success: false, error: 'GitHub 登录失败' }
    }
  })
  .post('/logout', async ({ headers, set, request }) => {
    const authHeader = headers.authorization
    const cookieHeader = headers.cookie
    let token = ''

    if (authHeader) {
      const [scheme, t] = authHeader.split(' ')
      if (scheme?.toLowerCase() === 'bearer' && t) token = t
    }

    if (!token && cookieHeader) {
      const match = cookieHeader.match(/auth_token=([^;]+)/)
      if (match) token = match[1] ?? ''
    }

    if (!token) {
      clearAuthCookie(set)
      return { success: true }
    }

    try {
      await AdminAuthService.logout(token)
    } catch {
      // ignore
    }

    clearAuthCookie(set)
    return { success: true }
  })
