import { Elysia } from 'elysia'
import { cors } from '@elysiajs/cors'
import { swagger } from '@elysiajs/swagger'
import { announcementRoutes } from './routes/announcements'
import { updateRoutes, staticRoutes } from './routes/updates'
import { authRoutes } from './routes/auth'
import { adminRoutes } from './routes/admin'
import { prisma } from './services/db'

const app = new Elysia()
  .derive(() => ({
    startTime: performance.now()
  }))
  .onAfterHandle(({ request, startTime, set }) => {
    const duration = (performance.now() - startTime).toFixed(2)
    const status = set.status ?? 200
    set.headers['X-Content-Type-Options'] = 'nosniff'
    set.headers['X-Frame-Options'] = 'DENY'
    set.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    set.headers['X-XSS-Protection'] = '0'
    console.log(`[${new Date().toISOString()}] ${request.method} ${request.url} - ${status} (${duration}ms)`)
  })
  .use(cors({
    credentials: true,
  }))
  .use(swagger({
    documentation: {
      info: {
        title: 'PCL CE API v2',
        description: 'PCL Community Edition API Server',
        version: '2.0.0',
      },
    },
  }))
  // 健康检查端点
  .get('/health', () => ({ status: 'ok' }))
  // 挂载公告路由
  .use(announcementRoutes)
  // 挂载更新路由
  .use(updateRoutes)
  // 挂载静态下载重定向路由 (不受 /apiv2 约束)
  .use(staticRoutes)
  // 挂载认证路由
  .use(authRoutes)
  // 挂载管理路由
  .use(adminRoutes)
  // 优雅关闭
  .onStop(async () => {
    await prisma.$disconnect()
  })

const PORT = process.env.PORT || 3000

app.listen(PORT)

console.log(`🦊 PCL CE API Server running at http://localhost:${PORT}`)
console.log(`📚 Swagger documentation at http://localhost:${PORT}/swagger`)

export type App = typeof app