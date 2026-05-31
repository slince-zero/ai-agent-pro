# ai-pro-agent

面向工程协作场景的 AI Agent 工作台。当前版本提供聊天式任务入口、SSE 流式输出、OpenAI-compatible 模型调用、工具调用、会话持久化和运行记录落库。

![AI Engineering Agent welcome screen](docs/screenshots/ai-pro-agent-welcome.png)

## 功能概览

- 工程任务聊天 UI：仓库研究、代码理解、Bug 排查、重构规划等预设入口。
- 流式 Agent 回复：后端通过 SSE 推送文本、工具调用和工具结果。
- 会话持久化：Postgres 保存用户、会话、消息、AgentRun、ToolCall。
- 内置工具：公开 GitHub 仓库元数据查询、公开网页文本读取。
- 可容器化部署：根目录 Dockerfile 会构建前端静态资源并打包后端服务。

## 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | React 19, Vite 8, TypeScript, Tailwind CSS 4, Radix UI, lucide-react |
| 后端 | Node.js 22, Express 5, TypeScript, OpenAI SDK |
| Agent | Chat Completions streaming, function calling, SSE events |
| 数据 | PostgreSQL, Prisma 7, pgvector Docker image |
| 部署 | Docker multi-stage build, docker-compose |

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
- npm
- Docker Desktop 或本地 PostgreSQL
- DeepSeek 或其他 OpenAI-compatible API Key

1. 启动数据库：

```bash
docker compose up -d postgres
```

2. 配置后端环境变量：

```bash
cp server/.env.example server/.env
```

至少填写：

```env
OPENAI_API_KEY=your_api_key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-pro
DATABASE_URL=postgresql://ai_agent:ai_agent@localhost:5432/ai_pro_agent
```

`GITHUB_TOKEN` 可选；不配置时 GitHub API 会使用未认证额度。

3. 安装并启动后端：

```bash
cd server
npm install
npm run generate
npm run migrate:dev
npm run dev
```

后端默认运行在 `http://localhost:3003`。

4. 安装并启动前端：

```bash
cd client
npm install
npm run dev
```

前端默认运行在 `http://localhost:5173`，Vite 会把 `/api` 代理到 `http://localhost:3003`。

## 常用脚本

前端：

```bash
cd client
npm run dev
npm run build
npm run lint
```

后端：

```bash
cd server
npm run dev
npm run generate
npm run migrate:dev
npm run build
npm run start
```

Docker 本地构建：

```bash
docker build -t ai-pro-agent:local .
docker run \
  --env-file server/.env \
  -e DATABASE_URL=postgresql://ai_agent:ai_agent@host.docker.internal:5432/ai_pro_agent \
  -p 3003:3003 \
  ai-pro-agent:local
```

## 目录结构

```txt
.
├── client/                 # React + Vite 前端
├── server/                 # Express + Prisma 后端
│   ├── prisma/             # Prisma schema 和 migrations
│   └── src/
│       ├── routes/         # chat/session API
│       ├── services/       # OpenAI client、Agent runtime、用户服务
│       ├── tools/          # Agent 工具定义和执行器
│       └── sse/            # SSE event helpers
├── docs/                   # 架构、路线图、截图
├── Dockerfile
└── docker-compose.yml
```

## 环境变量

| 变量 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `OPENAI_API_KEY` | 是 | 空 | OpenAI-compatible API Key。 |
| `DEEPSEEK_BASE_URL` | 否 | `https://api.deepseek.com` | 模型服务 base URL。 |
| `DEEPSEEK_MODEL` | 否 | `deepseek-v4-pro` | 后端请求的模型名。 |
| `DATABASE_URL` | 否 | `postgresql://ai_agent:ai_agent@localhost:5432/ai_pro_agent` | Prisma/Postgres 连接串。 |
| `GITHUB_TOKEN` | 否 | 空 | GitHub 仓库查询工具的可选 token。 |
| `DEFAULT_USER_EMAIL` | 否 | `local@ai-pro-agent.dev` | 当前无鉴权版本使用的本地用户标识。 |
| `PORT` | 否 | `3003` | 后端监听端口。 |
| `CLIENT_DIST_DIR` | 否 | `public` | 生产模式下 Express 托管前端静态资源的位置。 |

## 当前限制

- 当前没有正式鉴权，多用户部署前需要补认证和会话隔离。
- `/api/chat` 是旧的无持久化链路，前端主流程使用 `/api/sessions/:sessionId/messages`。
- `web_fetch` 工具只做了基础协议和内容大小限制，还需要 SSRF 防护后再暴露到公网。
- 后端测试和 CI 仍待补齐。

## 路线图

长期演进计划见 [docs/roadmap.md](docs/roadmap.md)。当前优先级是补齐开源基线、稳定 Agent runtime、增加上下文/记忆/RAG 和可追溯的运行记录。
