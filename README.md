# Better APIv2

PCL CE 的 APIv2 实现，使用 ElysiaJS、TypeScript 和 Prisma 重新构建。

> 由于我没有使用 Elysiajs 和 Bun 的开发经验，因此后端代码全部为 vibe-coding 得到。_REVIEW REQUIRED_

## 🚀 快速开始

```bash
# 1. 进入项目
cd better-apiv2/apps/backend

# 2. 复制环境变量
cp .env.example .env
# 编辑 .env 配置数据库

# 3. 安装依赖
pnpm install

# 4. 初始化数据库
pnpm run prisma:generate
pnpm run db:push

# 5. 启动开发服务器
pnpm run dev

# 访问 Swagger 文档
# http://localhost:3000/swagger
```

## LICENSE

MIT