# Struct — PCL CE API v2 后端数据结构

> 用于 Rust 重写参考。来源：`apps/backend/` TypeScript 代码 + Prisma schema。

---

## 1 DB Models (PostgreSQL)

### `update_files` — UpdateFile

| 字段 | 类型 | 说明 |
|---|---|---|
| id | UUID | PK |
| file_name | String | 展示用文件名 |
| channel | Enum(FRARM64,FRX64,SRARM64,SRX64) | 渠道 |
| version_name | String | 语义版本名 |
| version_code | Int | 递增版本号 |
| required_dotnet | Int | 最低 .NET 版本 |
| required_windows | String | 最低 Windows build |
| original_name | String | 上传时原始文件名 |
| file_size | Int | zip 文件大小 bytes |
| sha256 | String | zip 的 SHA256 hex |
| s3_key | String UNIQUE | 存储键 |
| s3_url | String | S3 公开 URL 或本地路径 |
| source_group | String? | CDN 源组名 |
| changelog | Text | Markdown 更新日志 |
| uploaded_by_admin | String | 上传者 GitHub login |
| uploaded_at | DateTime | 上传时间 |
| created_at | DateTime | 自动 |
| updated_at | DateTime | 自动 |

索引：`channel`, `version_code`, `sha256`

关系：
- `patch_jobs` → PatchJobQueue[] (此文件的补丁任务)
- `generated_patches` → PatchFile[] (以此文件为目标的补丁，`@relation("ToUpdateFile")`)
- `source_patches` → PatchFile[] (以此文件为来源的补丁，`@relation("FromUpdateFile")`)

### `patch_files` — PatchFile

| 字段 | 类型 | 说明 |
|---|---|---|
| id | UUID | PK |
| from_update_file_id | UUID FK | 旧版本 |
| to_update_file_id | UUID FK | 新版本 |
| patch_file_size | Int | bytes |
| patch_sha256 | String | 补丁文件 SHA256 |
| s3_key | String UNIQUE | 存储键 |
| s3_url | String | 公开 URL |
| created_at | DateTime | 自动 |

唯一约束：`(from_update_file_id, to_update_file_id)`
索引：`from_update_file_id`, `to_update_file_id`

级联删除：`onDelete: Cascade` 关联 UpdateFile。

### `patch_job_queues` — PatchJobQueue

| 字段 | 类型 | 说明 |
|---|---|---|
| id | UUID | PK |
| update_file_id | String FK | 目标更新文件 |
| status | Enum(PENDING,PROCESSING,SUCCESS,FAILED) | 任务状态 |
| source_version_code | Int | 旧版本号 |
| target_version_code | Int | 新版本号 |
| error_message | Text? | 失败原因 |
| created_at | DateTime | 自动 |
| started_at | DateTime? | 开始处理时间 |
| completed_at | DateTime? | 完成时间 |

索引：`status`, `update_file_id`

### `release_sources` — ReleaseSource

| 字段 | 类型 | 说明 |
|---|---|---|
| id | UUID | PK |
| name | String | 名称 |
| base_url | String | CDN 基址 |
| group_name | String | 组名 |
| enabled | Boolean | 默认 true |
| created_at | DateTime | 自动 |
| updated_at | DateTime | 自动 |

唯一约束：`(name, group_name)`
索引：`group_name`

### `announcements` — Announcement

| 字段 | 类型 | 说明 |
|---|---|---|
| id | UUID | PK |
| title | String | 标题 |
| detail | String | 旧式详情（兼容） |
| details | Text? | 新式详情 |
| priority | Int | 优先级 |
| level | Int | 等级 |
| skip | Text? | JSON 跳过条件 |
| buttons | Text? | JSON 按钮数组 |
| date | DateTime | 公告日期 |
| created_at | DateTime | 自动 |
| updated_at | DateTime | 自动 |

### `announcement_buttons` — AnnouncementButton

| 字段 | 类型 | 说明 |
|---|---|---|
| id | UUID | PK |
| text | String | 按钮文字 |
| command | Enum(OPEN_URL,OPEN_WEBPAGE) | 命令 |
| command_parameter | String | 参数 |
| announcement_id1 | String? UNIQUE FK | 关联公告 (button1) |
| announcement_id2 | String? UNIQUE FK | 关联公告 (button2) |

### `admin_users` — AdminUser

| 字段 | 类型 | 说明 |
|---|---|---|
| id | UUID | PK |
| github_id | String UNIQUE | GitHub 用户 ID |
| login | String UNIQUE | GitHub 用户名 |
| name | String? | 显示名 |
| avatar_url | String? | 头像 URL |
| is_team_member | Boolean | 是否团队内 |
| created_at | DateTime | 自动 |
| updated_at | DateTime | 自动 |

### `admin_sessions` — AdminSession

| 字段 | 类型 | 说明 |
|---|---|---|
| id | UUID | PK |
| token | String UNIQUE | 会话令牌 |
| user_id | String FK | AdminUser |
| expires_at | DateTime | 过期时间 |
| created_at | DateTime | 自动 |

索引：`token`, `expires_at`

### `caches` — Cache

| 字段 | 类型 | 说明 |
|---|---|---|
| id | UUID | PK |
| key | String UNIQUE | 缓存键 |
| value | Text | JSON 值 |
| expires_at | DateTime? | 过期时间 |
| created_at | DateTime | 自动 |

用途：OAuth state 存储（非 Redis）。

---

## 2 Enums

| 枚举 | 值 | 用途 |
|---|---|---|
| `VersionChannel` | FRARM64, FRX64, SRARM64, SRX64 | 更新渠道 |
| `ButtonCommand` | OPEN_URL, OPEN_WEBPAGE | 公告按钮命令（旧式） |
| `PatchJobStatus` | PENDING, PROCESSING, SUCCESS, FAILED | 补丁任务状态 |

---

## 3 API Routes

### 3.1 公开端点 (限流 200/min)

| 方法 | 路径 | 响应 | 说明 |
|---|---|---|---|
| GET | `/health` | `{ status: "ok" }` | 健康检查 |
| GET | `/apiv2/announcements` | `Announcement[]` | 公告列表 |
| GET | `/apiv2/announcements.json` | `Announcement[]` | 同上，兼容 |
| GET | `/apiv2/cache.json` | `CacheResponse` | MD5 哈希映射 |
| GET | `/apiv2/cache` | `CacheResponse` | 同上 |
| GET | `/apiv2/updates/updates-{channel}.json` | `UpdatesResponse` | 按渠道最新版本 |
| GET | `/apiv2/updates` | `UpdatesResponse` | 全部或按 ?channel= 过滤 |
| GET | `/apiv2/updates/:id` | `UpdatesResponse` | 同上，兼容旧路由 |
| GET | `/apiv2/updates/:id/download` | 302 redirect 或 zip body | 下载主文件 |
| GET | `/apiv2/updates/:id/patches/:patchId/download` | 二进制 body | 下载补丁 |
| GET | `/static/patch/:filename` | 302 redirect 或 body | 按 SHA 对下载补丁 |

### 3.2 公开响应类型

```rust
// GET /apiv2/announcements
struct Announcement {
    id: String,
    title: String,
    details: String,
    priority: i32,
    level: i32,
    date: String,           // "2024-01-15 14:30:00+08:00"
    skip: Option<Skip>,
    buttons: Vec<Button>,
}
struct Skip {
    min: Option<String>,    // 最小版本名
    max: Option<String>,    // 最大版本名
    not_before: Option<String>,
    not_after: Option<String>,
}
struct Button {
    text: String,
    exec: String,           // "OpenWebsite"
    argument: String,
}

// GET /apiv2/updates
struct UpdatesResponse {
    assets: Vec<UpdateAsset>,
}
struct UpdateAsset {
    id: String,
    file_name: String,
    required: Requirements,
    version: Version,
    upd_time: String,       // "2024-01-15 14:30:00"
    downloads: Vec<String>, // ["/apiv2/updates/{id}/download"]
    patches: Vec<String>,   // ["{old_sha256}_{new_sha256}.patch"]
    sha256: String,
    changelog: String,
}
struct Requirements {
    dotnet: i32,
    windows: String,        // "10.0.19045"
}
struct Version {
    channel: String,        // "frarm64" | "frx64" | "srarm64" | "srx64"
    name: String,
    code: i32,
}

// GET /apiv2/cache
type CacheResponse = HashMap<String, String>; // key: channel name, value: MD5 hex
```

### 3.3 管理端点 (限流 60/min, 需 Bearer/Cookie 认证)

| 方法 | 路径 | 请求 | 说明 |
|---|---|---|---|
| GET | `/admin/me` | — | 当前用户信息 |
| POST | `/admin/announcements` | JSON body | 创建公告 |
| PUT | `/admin/announcements/:id` | JSON body | 更新公告 |
| DELETE | `/admin/announcements/:id` | — | 删除公告 |
| POST | `/admin/updates` | multipart/form-data | 上传新版本 |
| POST | `/admin/updates/batch` | multipart/form-data | 批量发版 |
| PUT | `/admin/updates/:id` | JSON body | 更新元数据 |
| DELETE | `/admin/updates/:id` | — | 删除版本 |
| GET | `/admin/sources` | ?group= | 源列表 |
| POST | `/admin/sources` | JSON body | 创建源 |
| PUT | `/admin/sources/:id` | JSON body | 更新源 |
| DELETE | `/admin/sources/:id` | — | 删除源 |

### 3.4 认证端点 (限流 20/min)

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/auth/github/login` | 302 → GitHub OAuth |
| GET | `/auth/github/callback` | OAuth 回调，设 Cookie |
| POST | `/auth/github/logout` | 清除会话 |

---

## 4 Service Layer

### `UpdateService`

| 方法 | 说明 |
|---|---|
| `get_updates_by_channel(channel, base_url)` | 按渠道取最新版本，含补丁引用 |
| `get_all_updates(base_url)` | 取所有渠道最新 |
| `compute_cache(base_url)` | 生成 MD5 哈希映射 |
| `create_update_from_upload(input)` | 上传文件 + 创建 DB 记录 + 触发补丁任务 |
| `batch_release(input)` | 批量发版（多次 create） |
| `update_metadata(id, input)` | 更新元数据 |
| `delete_update(id)` | 删除文件 + 补丁 + DB + 存储 |
| `get_update_redirect_url(id)` | 构造 CDN/S3 重定向 URL |
| `get_update_download_info(id)` | 合并重定向 + 本地路径（优化版） |
| `get_update_download_path_and_sha(id)` | 取本地路径 + SHA |
| `get_patch_download_info(id)` | 取补丁本地路径 |
| `get_patch_download_info_by_sha256(old, new)` | 按 SHA 对取补丁路径 |
| `get_patch_redirect_url_by_sha256(old, new)` | 构造补丁重定向 URL |
| `get_patch_download_info_combined(old, new)` | 合并补丁重定向 + 本地路径（优化版） |
| `get_patch_s3_url_by_sha256(old, new)` | 取补丁 S3 URL |
| `run_patch_jobs_for_update(file_id)` | 执行队列中所有待处理补丁 |
| `process_patch_job(job_id)` | 单条补丁任务（bsdiff） |
| `detect_channel(file_name)` | 从文件名推断渠道 |

### `ReleaseSourceService`

| 方法 | 说明 |
|---|---|
| `list_sources(group_name?)` | 列出源 |
| `create_source(input)` | 创建源 |
| `update_source(id, input)` | 更新源 |
| `delete_source(id)` | 删除源 |
| `get_download_urls(sha256, group_name)` | 取 CDN 下载 URL 列表 |
| `get_patch_download_urls(filename, group_name)` | 取补丁 CDN URL 列表 |

### `AnnouncementService`

| 方法 | 说明 |
|---|---|
| `get_announcements()` | 取公告列表（Redis 缓存） |
| `create_announcement(data)` | 创建公告 |
| `update_announcement(id, data)` | 更新公告 |
| `delete_announcement(id)` | 删除公告 |

### `AdminAuthService`

| 方法 | 说明 |
|---|---|
| `login_with_github_code(code)` | OAuth 登录 |
| `get_admin_user_by_token(token)` | 令牌验证 |
| `logout(token)` | 登出 |

### `ObjectStorageService`

| 方法 | 说明 |
|---|---|
| `upload_buffer(key, buf, opts)` | 写本地 + 上传 S3 |
| `delete_object(key, s3_key?)` | 删本地 + 删 S3 |
| `get_local_path(key)` | 本地路径 |
| `get_public_location(key)` | 公开 URL |
| `exists(key)` | 本地文件存在 |
| `sanitize_key_part(value)` | 清理文件名 |

---

## 5 Redis 缓存

前缀：`better-api:`

| 键模式 | 值 | TTL | 用途 |
|---|---|---|---|
| `announcements` | `Announcement[]` | 3600s | 公告列表 |
| `updates:channel:{channel}:{base_url?}` | `UpdatesResponse` | 3600s | 按渠道的最新版本 |
| `updates:all:{base_url?}` | `UpdatesResponse` | 3600s | 所有渠道 |
| `cache:json:{base_url?}` | `CacheResponse` | 3600s | MD5 缓存 |
| `updateFile:{id}` | JSON UpdateFile 记录 | 300s | 单个文件查询 |
| `patchFile:{id}` | JSON PatchFile+from | 300s | 单个补丁查询 |
| `patchFile:{old_sha}:{new_sha}` | JSON PatchFile 全量 | 300s | SHA 对查询 |
| `releaseSource:{group}` | `[{base_url}]` | 600s | 源组 URL 列表 |

失效策略：
- 创建/更新/删除操作 → `invalidate_all_cache()` 核弹清前缀
- 创建更新 → `invalidate_update_file_cache(id)` + `invalidate_channel_cache(channel)`
- 更新元数据 → `invalidate_update_file_cache(id)`
- 删除更新 → `invalidate_update_file_cache(id)` + `invalidate_channel_cache`
- 补丁生成 → `invalidate_patch_file_cache(id)` + `invalidate_patch_file_by_sha_cache(old, new)`

---

## 6 内存状态（非 DB/Redis）

### 限流器 (rate-limiter.ts)

```
内存 Map<String, { count: i32, reset_at: i64 }>
默认窗口: 60s, 默认上限: 100
公开端点: 200/min, 管理端点: 60/min, 认证端点: 20/min
```

### 存储后端列表

```
ObjectStorageService.backends: Vec<S3Backend>
S3Backend { name, client, bucket, public_base_url }
从 `S3_BACKENDS` JSON 环境变量或传统 `S3_*` 环境变量解析
```

---

## 7 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `DATABASE_URL` | — | PostgreSQL 连接串 |
| `REDIS_URL` | `redis://localhost:6379` | Redis |
| `PORT` | 3000 | HTTP 端口 |
| `CORS_ORIGIN` | true(允许任意) | CORS 源 |
| `NODE_ENV` | development | 环境 |
| `GITHUB_CLIENT_ID` | — | GitHub OAuth |
| `GITHUB_CLIENT_SECRET` | — | GitHub OAuth |
| `GITHUB_REDIRECT_URI` | — | OAuth 回调 URL |
| `GITHUB_ORG` | PCL-Community | 组织名 |
| `GITHUB_TEAM_SLUG` | ce-dev | 团队名 |
| `ADMIN_SESSION_TTL_HOURS` | 24 | 会话过期时间 |
| `STORAGE_PROVIDER` | local | local/s3/r2 |
| `S3_BACKENDS` | — | JSON 多后端配置 |
| `S3_ENDPOINT` | — | S3 端点 |
| `S3_REGION` | auto | S3 区域 |
| `S3_BUCKET` | — | 桶名 |
| `S3_ACCESS_KEY_ID` | — | 访问密钥 |
| `S3_SECRET_ACCESS_KEY` | — | 密钥 |
| `S3_PUBLIC_BASE_URL` | — | 公网访问 URL |
| `UPLOAD_DIR` | ./uploads | 本地存储目录 |
| `PATCH_CONCURRENCY` | 2 | 并行补丁生成数 |
| `BSDIFF_COMMAND` | bsdiff | bsdiff 二进制路径 |

---

## 8 文件结构

```
apps/backend/src/
├── index.ts                   # App 入口, 路由挂载, 中间件
├── routes/
│   ├── updates.ts             # 公开更新下载路由 + 静态补丁路由
│   ├── announcements.ts       # 公开公告路由
│   ├── auth.ts                # GitHub OAuth 路由
│   └── admin.ts               # 管理端路由
├── services/
│   ├── db.ts                  # Prisma client 单例
│   ├── redis.ts               # Redis client + 缓存工具
│   ├── update-file.ts         # UpdateService + ReleaseSourceService
│   ├── update.ts              # Re-export
│   ├── announcement.ts        # AnnouncementService
│   ├── admin-auth.ts          # AdminAuthService
│   ├── admin-guard.ts         # requireAdmin 中间件
│   ├── github-auth.ts         # GitHub API 调用
│   ├── object-storage.ts      # ObjectStorageService
│   └── rate-limiter.ts        # 内存限流器
└── types/
    ├── update.ts              # 更新 API 类型
    └── announcement.ts        # 公告 API 类型
```

---

## 9 关键业务流程

### 9.1 版本发布

1. `POST /admin/updates` → multipart 接收 exe
2. 计算 SHA256, 压缩为 zip
3. 上传到本地 + S3
4. DB 创建 UpdateFile 记录
5. 为同渠道所有旧版本创建 PatchJobQueue (PENDING)
6. 后台 `run_patch_jobs_for_update` → `process_patch_job`
7. 每个 job: 下载旧 exe + 新 exe → bsdiff → 上传 patch → 创建 PatchFile 记录
8. 失效缓存

### 9.2 下载流程

1. `GET /apiv2/updates/:id/download`
2. 查缓存 `updateFile:{id}` → miss 则查 DB → 缓存结果
3. 有 sourceGroup → 查 `releaseSource:{group}` → 随机选 CDN URL → 302 重定向
4. 无 CDN → s3_url 以 http 开头 → 302 重定向到 S3
5. 否则 → 本地文件 Bun.file() → 流式响应

### 9.3 补丁下载

1. `GET /static/patch/{old_sha256}_{new_sha256}.patch`
2. 查缓存 `patchFile:{old_sha}:{new_sha}` → miss 则查 DB
3. 有 sourceGroup → CDN 302
4. 否则 → 本地文件响应

---

## 10 Rust 重写建议

| 模块 | 建议 |
|---|---|
| Web 框架 | Actix-web 或 Axum |
| ORM | SQLx (手写) 或 SeaORM / Diesel |
| Redis | redis-rs |
| S3 | aws-sdk-s3 |
| 缓存 | Redis 同上，注意缓存键一致 |
| GitHub OAuth | reqwest |
| 补丁生成 | 子进程调用 bsdiff (Command) |
| 限流 | 内存 `HashMap<String, RateLimitState>` + 定期清理 |
| 配置 | dotenvy + 环境变量 |
