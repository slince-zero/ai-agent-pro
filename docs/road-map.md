项目现在更接近：

> Chat UI + LLM streaming + function calling demo

还没到：

> 有状态、有上下文管理、有工具执行记录、有记忆、有知识检索、有任务运行生命周期的 Agent 系统

**当前架构缺口**
现在已有的部分：

- 模型调用：在 [server/src/services/agent.ts](/Users/zhangbowen/Downloads/ai-pro-agent/server/src/services/agent.ts:33)
- 工具注册/执行：在 [server/src/tools/index.ts](/Users/zhangbowen/Downloads/ai-pro-agent/server/src/tools/index.ts:1)
- SSE 流式事件：在 [server/src/routes/chat.ts](/Users/zhangbowen/Downloads/ai-pro-agent/server/src/routes/chat.ts:30)
- 前端聊天状态：在 [client/src/App.tsx](/Users/zhangbowen/Downloads/ai-pro-agent/client/src/App.tsx:12)

缺的核心模块：

- 数据库持久化：sessions、messages、agent runs、tool calls
- 上下文构建器：每次请求前决定塞哪些历史、记忆、RAG 内容、工具结果
- 记忆系统：用户偏好、项目事实、长期任务状态
- RAG：文档/仓库内容入库、chunk、embedding、检索、引用
- 工具运行生命周期：tool_call_id、状态、耗时、错误、重试
- Agent 运行记录：一次请求不只是 message，而是一个 run
- eval/trace：以后判断 agent 是否变聪明，需要样例和运行日志

**建议下一步先做数据库，不要做 localStorage**

的想法是对的。这个项目如果要往 Agent 方向走，会话保存应该直接上数据库，因为后面记忆、RAG、工具日志、运行追踪都要依赖 DB。

推荐技术路线：

- 开发阶段：Postgres + pgvector，用 Docker Compose 起
- ORM：Drizzle 或 Prisma，偏轻量会选 Drizzle
- RAG 向量：直接放 pgvector，先别引入复杂向量库
- 文件/网页原文：短文本进 DB，长内容后续再抽象对象存储

最小表结构可以先这样：

```sql
users
sessions
messages
agent_runs
tool_calls
memories
documents
document_chunks
```

其中关键是这几张：

```sql
sessions
- id
- title
- created_at
- updated_at

messages
- id
- session_id
- role
- content
- created_at

agent_runs
- id
- session_id
- user_message_id
- status
- model
- input_tokens
- output_tokens
- started_at
- finished_at
- error

tool_calls
- id
- run_id
- name
- arguments_json
- result_text
- status
- duration_ms
- error
- created_at
```

这一步做完，的项目会从“聊天页面”变成“Agent runtime 有状态系统”。

**第二步：重构 Agent Runtime**

现在 [runAgent](/Users/zhangbowen/Downloads/ai-pro-agent/server/src/services/agent.ts:33) 同时负责：

- 拼 prompt
- 调模型
- 解析 stream
- 累积 tool call
- 执行工具
- 推送事件

后面会越来越难维护。

建议拆成：

```txt
services/
  agent-runtime.ts      # 控制 run 生命周期
  model-client.ts       # 模型适配层
  context-builder.ts    # 构建上下文
  memory-service.ts     # 读写记忆
  rag-service.ts        # 检索知识
  tool-runner.ts        # 执行工具并记录
```

一次请求流程应该变成：

```txt
用户消息
-> 存 messages
-> 创建 agent_run
-> context-builder 组装上下文
-> model stream
-> tool runner 执行工具并入库
-> 继续 model
-> 存 assistant message
-> run 完成
```

这比现在直接把前端 messages 传给模型更像 Agent 系统。

**第三步：上下文系统，而不是简单历史消息**

Agent 的关键不只是“有历史”，而是每次都能选择合适上下文。

可以做一个 `ContextBuilder`，输入：

```ts
{
  sessionId,
  userMessage,
  recentMessages,
}
```

输出：

```ts
{
  systemPrompt,
  shortTermMessages,
  retrievedKnowledge,
  relevantMemories,
  toolHints,
}
```

上下文优先级建议：

1. 当前用户问题
2. 系统提示词
3. 最近 8-12 条对话
4. 当前项目/任务摘要
5. RAG 检索结果
6. 长期记忆
7. 历史工具结果摘要

不要一开始就把所有历史塞进去。后面上下文会爆。

**第四步：记忆不要和 RAG 混在一起**

这点很重要。

RAG 是“外部知识”：

- 项目 README
- 文档
- GitHub 文件
- 用户上传资料
- 技术文章

Memory 是“和用户/任务相关的事实”：

- 用户偏好 TypeScript
- 这个项目使用 DeepSeek
- 用户希望回答偏中文
- 某个 session 的目标是做工程 Agent
- 用户决定会话保存接数据库

建议先做三类 memory：

```txt
user_memory       用户长期偏好
project_memory    当前项目事实
session_summary   当前会话摘要
```

先不用做自动长期记忆，风险比较高。第一版可以让模型提出 memory candidate，然后后端按规则保存，或者先只做 session summary。

**第五步：RAG 应该围绕“工程 Agent”设计**

不要做一个泛泛的“上传文档问答”。的项目定位是工程 Agent，所以 RAG 第一版应该支持：

- 输入 GitHub 仓库 URL
- 拉 README / package.json / 目录树 / 指定源码文件
- chunk 后入库
- 对当前问题检索相关文件片段
- 回答时带来源文件路径

最有价值的 RAG 工作流是：

```txt
添加仓库
-> 抓取关键文件
-> 生成项目索引
-> 用户问“这个项目怎么启动/鉴权在哪/如何改某功能”
-> 检索相关文件
-> Agent 给出带文件依据的回答
```

这样的 Agent 和普通聊天工具就拉开差距了。

**会按这个顺序迭代**

第一阶段：Agent 数据底座

- 接 Postgres
- sessions/messages 入库
- agent_runs/tool_calls 入库
- 前端支持会话列表、切换会话
- API 从无状态 `/api/chat` 改成基于 `sessionId`

第二阶段：Agent Runtime 重构

- 拆 `runAgent`
- 工具调用带唯一 `tool_call_id`
- 工具状态、耗时、错误持久化
- 上下文由 `context-builder` 统一生成

第三阶段：Memory

- session summary
- project memory
- user preference memory
- 每次请求自动注入相关 memory

第四阶段：RAG

- documents/document_chunks 表
- embedding 入库
- GitHub 仓库索引工具
- 检索结果注入上下文
- 回答展示引用来源

第五阶段：Agent 能力增强

- Web fetch 升级成 search + fetch
- GitHub 工具升级成 repo tree / file content / issues / PR
- 增加代码审查、报错诊断、重构计划的专用 workflow

下一步最应该做的不是“加更多工具”，而是先把 **DB + Run 生命周期 + ContextBuilder** 搭起来。否则工具、记忆、RAG 都会堆在现在的 `runAgent` 里，后面很快失控。