# ai-pro-agent 架构说明

本文档描述当前代码库的运行时架构。它反映的是现有实现，不包含未来规划中的 Memory、RAG、Eval、Trace UI 等模块。

## 系统拓扑

```mermaid
flowchart TB
  subgraph browser["Browser"]
    ui["React App\nclient/src/App.tsx"]
    composer["ChatComposer"]
    messages["MessageList"]
    sidebar["Sidebar"]
  end

  subgraph server["Express server"]
    app["createApp\nserver/src/app.ts"]
    sessionRoutes["/api/sessions\nserver/src/routes/sessions.ts"]
    agent["runAgent\nserver/src/services/agent.ts"]
    openai["OpenAI client\nserver/src/services/openai.ts"]
    toolRegistry["Tool registry\nserver/src/tools/index.ts"]
    sse["SSE helpers\nserver/src/sse/events.ts"]
  end

  subgraph tools["Built-in tools"]
    github["github_repository_lookup"]
    webfetch["web_fetch"]
  end

  subgraph data["Data layer"]
    prisma["Prisma client"]
    pg[("PostgreSQL")]
  end

  ui --> composer
  ui --> messages
  ui --> sidebar
  ui -->|"fetch /api/sessions"| sessionRoutes
  ui -->|"POST /api/sessions/:id/messages\nSSE response"| sessionRoutes

  app --> sessionRoutes
  app --> legacyChat
  sessionRoutes --> agent
  sessionRoutes --> sse
  sessionRoutes --> prisma
  prisma --> pg

  agent --> openai
  agent --> toolRegistry
  toolRegistry --> github
  toolRegistry --> webfetch
```

## 主请求时序

```mermaid
sequenceDiagram
  participant U as User
  participant C as React client
  participant R as /api/sessions route
  participant DB as PostgreSQL
  participant A as runAgent
  participant M as OpenAI-compatible model
  participant T as Tool registry

  U->>C: Send message
  C->>R: POST /api/sessions/:id/messages
  R->>DB: Insert user Message
  R->>DB: Create AgentRun
  R->>DB: Load recent user/assistant messages
  R->>A: runAgent(messages, onEvent, signal)
  A->>M: Stream chat completion with tools
  M-->>A: Text delta
  A-->>R: text event
  R-->>C: SSE text
  M-->>A: tool_calls finish reason
  A-->>R: tool_call event
  R->>DB: Insert ToolCall
  A->>T: runTool(name, args)
  T-->>A: Tool result text
  A-->>R: tool_result event
  R->>DB: Update ToolCall
  A->>M: Continue with tool result
  M-->>A: Final text delta
  R->>DB: Insert assistant Message
  R->>DB: Mark AgentRun completed
  R-->>C: SSE done
```

## 数据模型

```mermaid
erDiagram
  User ||--o{ Session : owns
  Session ||--o{ Message : contains
  Session ||--o{ AgentRun : records
  Message ||--o{ AgentRun : user_message
  Message ||--o{ AgentRun : assistant_message
  AgentRun ||--o{ ToolCall : includes

  User {
    string id
    string email
    string name
    datetime createdAt
    datetime updatedAt
  }

  Session {
    string id
    string userId
    string title
    SessionStatus status
    datetime createdAt
    datetime updatedAt
  }

  Message {
    string id
    string sessionId
    MessageRole role
    string content
    json metadata
    datetime createdAt
  }

  AgentRun {
    string id
    string sessionId
    string userMessageId
    string assistantMessageId
    RunStatus status
    string model
    string error
    datetime startedAt
    datetime finishedAt
  }

  ToolCall {
    string id
    string runId
    string toolCallId
    string name
    json arguments
    string result
    ToolCallStatus status
    string error
    datetime startedAt
    datetime finishedAt
  }
```

## 模块职责

| 模块                            | 职责                                                                  |
| ------------------------------- | --------------------------------------------------------------------- |
| `client/src/App.tsx`            | 管理当前会话、消息列表、输入状态、发送/停止流式请求。                 |
| `client/src/lib/sessions.ts`    | 会话列表、创建会话、读取消息的 REST API 封装。                        |
| `client/src/lib/chat-stream.ts` | 解析 SSE 数据并分发 `text`、`tool_call`、`tool_result`、`done` 事件。 |
| `server/src/app.ts`             | Express 应用创建、CORS、JSON body、API 路由和生产静态文件托管。       |
| `server/src/routes/sessions.ts` | 主聊天链路：会话 CRUD、消息入库、AgentRun/ToolCall 落库、SSE 输出。   |
| `server/src/services/agent.ts`  | 拼接系统提示与历史消息，调用模型流，解析工具调用，执行工具循环。      |
| `server/src/tools/index.ts`     | 工具注册表、OpenAI tool schema 转换、参数校验和统一执行。             |
| `server/prisma/schema.prisma`   | 用户、会话、消息、运行记录和工具调用的数据模型。                      |

## 部署形态

开发模式：

```txt
Browser -> Vite dev server :5173 -> Express API :3003 -> PostgreSQL :5432
```

生产 Docker 镜像：

```txt
Browser -> Express :3003
              ├─ /api/* -> API routes
              └─ /*     -> client/dist static files
```
