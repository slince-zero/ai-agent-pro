# ai-pro-agent

面向工程协作场景的 AI Agent 工作台。当前版本提供聊天式任务入口、SSE 流式输出、OpenAI-compatible 模型调用、工具调用、会话持久化和运行记录落库。

![AI Engineering Agent welcome screen](docs/screenshots/ai-pro-agent-welcome.png)

## 功能概览

- 工程任务聊天 UI：仓库研究、代码理解、Bug 排查、重构规划等预设入口。
- 流式 Agent 回复：后端通过 SSE 推送文本、工具调用和工具结果。
- 会话持久化：Postgres 保存用户、会话、消息、AgentRun、ToolCall。
- 内置工具：公开 GitHub 仓库元数据查询、公开网页文本读取。
- 可容器化部署：Dockerfile 构建前端静态资源并打包后端服务。

## 技术栈

| 层    | 技术                                                                 |
| ----- | -------------------------------------------------------------------- |
| 前端  | React 19, Vite 8, TypeScript, Tailwind CSS 4, Radix UI, lucide-react |
| 后端  | Node.js 22, Express 5, TypeScript, OpenAI SDK                        |
| Agent | Chat Completions streaming, function calling, SSE events             |
| 数据  | PostgreSQL, Prisma 7, pgvector Docker image                          |
| 部署  | Docker multi-stage build, docker-compose                             |

## 架构图

```mermaid
flowchart LR
  user["User / Browser"] --> client["React + Vite client"]
  client -->|"REST + SSE /api/sessions"| api["Express API"]

  api --> sessions["Session routes"]
  sessions --> runtime["runAgent runtime"]
  runtime --> model["OpenAI-compatible model\nDeepSeek by default"]
  runtime --> tools["Tool registry"]

  tools --> github["GitHub repo lookup"]
  tools --> fetch["Web fetch"]

  sessions --> prisma["Prisma client"]
  prisma --> db[("PostgreSQL")]

  api -. "production static files" .-> static["client/dist"]
```

更详细的请求时序和模块说明见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

## 快速启动

前置条件：

- Node.js 22+
- pnpm
- Docker Desktop
- DeepSeek 或其他 OpenAI-compatible API Key

### 1. 配置环境变量

本地开发推荐只维护根目录 `.env`：

```bash
cp .env.example .env
```

至少填写 `.env` 里的：

```env
OPENAI_API_KEY=your_api_key
MODEL_PROVIDER=openai-compatible
MODEL_BASE_URL=https://api.deepseek.com
MODEL_NAME=deepseek-v4-pro
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-pro
DATABASE_URL=postgresql://ai_agent:ai_agent@localhost:5432/ai_pro_agent
```

`MODEL_BASE_URL` / `MODEL_NAME` 优先级高于旧的 `DEEPSEEK_BASE_URL` / `DEEPSEEK_MODEL`，可直接切到 OpenRouter 等 OpenAI-compatible 服务。

`GITHUB_TOKEN` 可选；不配置时 GitHub API 会使用未认证额度。

如果你已经有旧的 `packages/server/.env`，直接运行 `pnpm dev` 也可以；脚本会在缺少根目录
`.env` 时复制一份出来，后续建议只维护根目录 `.env`。

### 2. 安装依赖并启动

```bash
pnpm install
pnpm dev
```

`pnpm dev` 会自动完成：

- 启动本地 Postgres：`docker compose up -d postgres`
- 等待数据库健康
- 生成 Prisma Client
- 应用已有数据库迁移
- 同时启动后端和前端开发服务器

后端默认运行在 `http://localhost:3003`，前端默认运行在 `http://localhost:5173`（Vite 会将 `/api` 代理到后端）。

## 本地启动排错

### `pnpm start` 报 `Cannot find module .../packages/server/dist/index.js`

`pnpm start` 会执行 server 的生产启动脚本 `node dist/index.js`。如果还没有运行过构建，
`packages/server/dist` 不存在，就会报这个错。

本地开发请使用：

```bash
pnpm dev
```

如果确实要用 `pnpm start`，需要先构建：

```bash
pnpm build
pnpm start
```

### `pnpm dev` 提示 `Fill OPENAI_API_KEY in .env`

根目录 `.env` 还没有配置模型 API Key。填好以后重新运行：

```bash
pnpm dev
```

### `docker compose up -d postgres` 报容器名冲突

如果之前已经创建过同名容器，可能会看到：

```txt
Conflict. The container name "/ai-pro-agent-postgres" is already in use
```

先确认旧容器是否还需要保留：

```bash
docker ps -a --filter name=ai-pro-agent-postgres
```

不需要的话删除旧容器后再启动：

```bash
docker rm ai-pro-agent-postgres
docker compose up -d postgres
```

### 前端启动成功，但接口返回 500

常见原因是 Postgres 已启动，但 Prisma migration 还没有应用，后端访问表时会失败。

执行：

```bash
pnpm dev:setup
```

可用下面命令确认迁移状态：

```bash
pnpm --filter server exec prisma migrate status
```

## 常用脚本

```bash
# 准备数据库、生成 Prisma Client、应用迁移，并启动前后端开发服务器
pnpm dev

# 只执行本地开发准备，不启动前后端
pnpm dev:setup

# 只启动前后端，适合数据库和迁移已经就绪时使用
pnpm dev:app

# 手动数据库命令
pnpm db:up
pnpm db:generate
pnpm db:migrate

# 构建所有包
pnpm build

# 单独运行某个包的命令
pnpm --filter client dev
pnpm --filter client build
pnpm --filter server dev
pnpm --filter server build
pnpm --filter server generate
pnpm --filter server migrate:dev
```

Docker 本地构建：

```bash
docker build -t ai-pro-agent:local .
docker run \
  --env-file .env \
  -e DATABASE_URL=postgresql://ai_agent:ai_agent@host.docker.internal:5432/ai_pro_agent \
  -p 3003:3003 \
  ai-pro-agent:local
```

## 目录结构

```txt
.
├── packages/
│   ├── client/             # React + Vite 前端
│   └── server/             # Express + Prisma 后端
│       ├── prisma/         # Prisma schema 和 migrations
│       └── src/
│           ├── routes/     # chat/session API
│           ├── services/   # OpenAI client、Agent runtime、用户服务
│           ├── tools/      # Agent 工具定义和执行器
│           └── sse/        # SSE event helpers
├── docs/                   # 架构、路线图、截图
├── pnpm-workspace.yaml
├── Dockerfile
└── docker-compose.yml
```

## 环境变量

本地开发时，后端和 Prisma 会优先读取根目录 `.env`，再兼容读取旧的 `packages/server/.env`。
Docker Compose 只启动 Postgres 时不需要 `.env`；如果启动 `ai-pro-agent` 应用服务，则仍需要根目录 `.env`。

| 变量                 | 必填 | 默认值                                                       | 说明                                        |
| -------------------- | ---- | ------------------------------------------------------------ | ------------------------------------------- |
| `OPENAI_API_KEY`     | 是   | 空                                                           | OpenAI-compatible API Key。                 |
| `MODEL_PROVIDER`     | 否   | `openai-compatible`                                          | 模型供应商；`anthropic` 目前为预留入口。    |
| `MODEL_BASE_URL`     | 否   | 空                                                           | OpenAI-compatible base URL，优先于旧变量。  |
| `MODEL_NAME`         | 否   | 空                                                           | 后端请求的模型名，优先于旧变量。            |
| `DEEPSEEK_BASE_URL`  | 否   | `https://api.deepseek.com`                                   | 兼容旧配置的模型服务 base URL。             |
| `DEEPSEEK_MODEL`     | 否   | `deepseek-v4-pro`                                            | 兼容旧配置的模型名。                        |
| `DATABASE_URL`       | 是   | `postgresql://ai_agent:ai_agent@localhost:5432/ai_pro_agent` | Prisma/Postgres 连接串。                    |
| `GITHUB_TOKEN`       | 否   | 空                                                           | GitHub 仓库查询工具的可选 token。           |
| `DEFAULT_USER_EMAIL` | 否   | `local@ai-pro-agent.dev`                                     | 当前无鉴权版本使用的本地用户标识。          |
| `PORT`               | 否   | `3003`                                                       | 后端监听端口。                              |
| `CLIENT_DIST_DIR`    | 否   | `public`                                                     | 生产模式下 Express 托管前端静态资源的位置。 |

## 当前限制

- 当前没有正式鉴权，多用户部署前需要补认证和会话隔离。
- 聊天链路为 `/api/sessions/:sessionId/messages`，支持会话持久化。
- `web_fetch` 工具只做了基础协议和内容大小限制，还需要 SSRF 防护后再暴露到公网。
- 后端测试和 CI 仍待补齐。

## 参与贡献

- 每个 PR 聚焦一个明确目标。
- 修改行为时优先补测试或最小化验证步骤。
- 分支命名建议使用 `fix/`、`feat/`、`chore/` 等前缀。
- PR 描述写清楚：改了什么、为什么改、怎么验证。涉及数据库或 API 行为变更时说明迁移和兼容性影响。
