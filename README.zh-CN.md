# Context

[![English](https://img.shields.io/badge/README-English-lightgrey?style=for-the-badge)](README.md)
[![简体中文](https://img.shields.io/badge/README-%E7%AE%80%E4%BD%93%E4%B8%AD%E6%96%87-2f6f4e?style=for-the-badge)](README.zh-CN.md)

一个从零实现、以上下文为中心的智能检索 Agent，不依赖任何 Agent framework。

它尝试把「帮我找一些符合这些条件的内容」这类模糊需求，转换为可执行、可追踪、可验证的检索过程。
项目的目的是在真实代码里理解模型协议、工具调用、Agent loop、上下文选择与证据处理，
而不是接一个把这些细节藏起来的库。

![Context 首页](docs/assets/landing.png)

## 为什么做这个项目

普通搜索擅长匹配关键词，但用户真正想表达的往往是一个由多种条件组成的目标：

> 我想找某类内容，它必须具有这些特征，不能包含那些特征，最好还满足另外一些偏好。

Context 希望逐步完成这条链路：理解需求、生成查询、获取候选结果、检查约束、根据证据重排，
最后解释每个结果为什么匹配，以及哪些信息仍然无法确认。

```text
用户需求
  → 解析目标、硬条件、排除条件与软偏好
  → 生成和调整搜索查询
  → 搜索并读取公开网页
  → 标准化、过滤和重排候选结果
  → 构建有限的证据上下文
  → 返回结果、匹配理由、来源与不确定项
```

## 目前已经完成

![Context 对话界面](docs/assets/chat.png)

每次提问会走完这条链路：`POST /api/questions/stream` → 重建当前任务与条件 → 澄清、日常对话或检索
→ 回答校验 → 以 NDJSON 事件流回到界面。

**检索意图**

- `retrievalIntentSchema`：目标、硬条件、排除条件、软偏好与待澄清项的严格 zod schema；
- `resolveRetrievalTask()`：DeepSeek JSON 模式（关闭思考模式）逐轮重建当前条件；明确的新任务切断旧上下文，
  模糊条件先澄清，普通对话禁用检索工具；
- `extractRetrievalIntent()` 保留为独立测试的单句解析学习函数；
- `buildSearchQueries()`：从意图生成起手查询，排除条件和待澄清项不进查询；
- `updateRetrievalIntent()` 保留为有测试与评测的补丁学习函数；对话链路选择从历史重建完整意图，
  不接收客户端传回的条件，也不保存服务端会话。

**工具**

- `search`：Tavily Search，每次最多 5 条命中，8 秒超时；
- `read_page`：Tavily Extract，取回 markdown 正文，最多 20 000 字符，12 秒超时；
- `executeTool()`：先用 zod 校验参数，再执行；参数错误、限流、提供方失败都变成模型能读懂的
  `{ ok: false, error }` 结果，而不是抛错结束运行。

**Agent loop**（`agent.ts`，不依赖任何框架）

- 最多 8 轮，最后一轮不带 tools，循环一定收敛；
- 一轮里的多个工具调用并行执行，按模型给出的顺序回填结果；
- 工具预算由代码而不是 prompt 执行：search 10 次、read_page 6 次，用尽后以普通工具结果的
  形式告诉模型，每条结果都带上剩余额度；
- 带 tools 的请求把上一轮的 `reasoning_content` 原样发回，这是 DeepSeek 思考模式的协议要求。
- `done` 之前检查引用归属、是否读过正文和当前条件是否覆盖；校验失败在原有八轮内修正，失败草稿不保留为答案。

**检索账本与上下文**（`context/retrieval-ledger.ts`）

- 服务端统一发放引用编号：同一个地址（忽略 `#hash` 和末尾斜杠）在一次运行里永远是同一个号；
- 页面正文单独存放，每次请求前重新投影：最近读的页面给全文，总量超过 60 000 字符时，
  较早的页面降级为 600 字符摘录，并提示模型不要重读；
- `projectContext()` 是纯函数，同一个账本永远投出同一份上下文。

**界面**

- 流式回答、思维链折叠、每轮的工具调用时间轴、token 用量、停止与重试；
- 本轮条件卡片区分必须满足、排除、偏好和待澄清项；
- 答案里的 `[n]` 变成可点开的角标，答案下方列出真正被引用过的来源，并标出哪些读过正文；
- Markdown、mermaid 与净化后的原始 HTML 渲染。

**评测**（[docs/evals.md](docs/evals.md)）

- `pnpm eval`：意图解析、意图更新、端到端 Agent 三套用例，调用真实模型，输出逐项检查和报告；
- Agent 的每次运行都检查引用能否对上来源、"已确认"是否有读过正文的来源支撑。

## 还没有做到

- **候选过滤与重排**：模型直接根据证据作答，还没有统一的候选结构、确定性硬过滤和可解释排序；
- **语义证据验证**：读过页面不代表每条结论都得到该页面支持，逐项来源摘录与确定性候选判定仍未完成；
- **页面读取边界**：robots、付费墙、非文本内容依赖 Tavily 自己的处理，项目里没有额外限制。

## 上下文设计

Context 不把上下文简单理解为无限增长的聊天记录，而是维护四类有边界的状态：

- **需求上下文**：用户正在寻找什么，以及当前任务目标；
- **约束上下文**：必须满足、必须排除、偏好满足和仍需澄清的条件；
- **检索上下文**：已经使用的查询、找到的候选项和排除原因；
- **证据上下文**：支持候选项属性和最终结论的来源片段。

模型生成的描述不自动成为事实。无法从来源确认的属性必须标记为未知，不能为了满足条件而猜测。

## 快速开始

### 环境要求

- Node.js 22+
- pnpm 11+
- DeepSeek API Key（对话与意图解析）
- Tavily API Key（search 与 read_page；没有它时工具调用会返回 `tool_unavailable`，
  模型只能回答"无法确认"）

### 本地运行

```bash
git clone https://github.com/slince-zero/ai-agent-pro.git
cd ai-agent-pro
pnpm install
cp packages/server/.env.example packages/server/.env

# 编辑 packages/server/.env，填入 DeepSeek 和 Tavily 的 API Key

pnpm dev
```

启动后访问 [http://localhost:5173](http://localhost:5173)。前端开发服务器会把 `/api` 请求代理到
`http://127.0.0.1:3001`；用 `PORT` 可以换一个前端端口。

> 环境变量沿用 OpenAI SDK 的 `OPENAI_API_KEY` 命名，但请求发送到 DeepSeek API，
> 模型固定为 `deepseek-v4-flash`（见 `packages/server/src/deepseek-client.ts`）。

## 常用命令

```bash
pnpm dev        # 同时启动前端和服务端
pnpm test       # 运行测试（不联网，进 CI）
pnpm eval       # 运行评测（调用真实模型，不进 CI），见 docs/evals.md
pnpm typecheck  # TypeScript 类型检查
pnpm lint:ci    # 代码检查与格式检查
pnpm build      # 构建所有 workspace package
```

## 项目结构

```text
packages/
  client/
    src/App.tsx              对话界面：流式消费、节奏化输出、用量、停止与重试
    src/agent-trace.tsx      每一轮的思维链与工具调用时间轴
    src/citations.tsx        行内引用角标与来源清单
    src/landing/             landing 页各个区块
    src/markdown.tsx         Markdown 管线：GFM、净化后的原始 HTML、图片降级
    src/mermaid-diagram.tsx  懒加载的 mermaid 渲染器，带错误边界
    src/streaming-markdown.ts 流式过程中给半个标记做临时收尾
    src/icons/               手绘风格图标集（/?icons 是总览页）
    src/pet/                 输入框上方的像素宠物
    src/util.ts              NDJSON 流式消费
  server/
    src/app.ts               Express 路由、请求校验，组装当前任务解析与 Agent loop
    src/agent.ts             Agent loop：轮次、并行工具调用、预算、system prompt
    src/deepseek-client.ts   DeepSeek 客户端与模型名
    src/context/             检索账本：引用编号、正文预算、上下文投影
    src/retrieval/           检索意图 schema、解析、更新与起手查询
    src/tools/               search、read_page 与参数校验分发器
    src/evals/               评测用例、判分与运行入口
    src/util.ts              agentLimits：轮次、工具预算与上下文预算
  shared/
    type.ts                  前后端共享的消息与流式事件类型
docs/
  product-plan.md            产品范围、实施顺序与验收标准
  evals.md                   评测怎么跑、怎么判分、怎么加用例
  learning-contract.md       Learning-first 协作约定
  decisions/                 架构决策记录
```

## 接下来要做

- [x] 带 Token 统计的流式对话链路
- [x] Markdown、mermaid 与净化后的原始 HTML 渲染
- [x] 结构化检索意图：目标、硬条件、排除条件与软偏好
- [x] 搜索工具与统一结果类型
- [x] 页面读取和正文提取
- [x] 原始工具调用协议与 Agent loop
- [x] 有界的证据上下文：引用编号、正文预算、可点开的来源
- [x] 评测集：意图解析、意图更新、端到端 Agent
- [ ] 候选过滤、证据选择与可解释重排
- [x] 逐轮重建当前条件，明确开始新任务时清空旧上下文
- [x] 检索前对模糊条件主动澄清

完整计划与阶段验收标准见 [产品与工程计划](docs/product-plan.md)。
可复现的问题、数据流和当前边界见 [最小检索闭环](docs/retrieval-closure.md)。

## 开发原则

- 从原始协议和循环开始，不使用 Agent framework 隐藏关键数据流；
- 每次只解决一个清晰的学习问题，并用测试验证；
- 先使用关键词和确定性过滤，再根据真实问题决定是否引入更复杂的检索技术；
- 结论必须尽可能由来源支撑，未知就是未知；
- 一个 Issue 对应一个 PR，每个能力都记录假设、边界、测试、观察到的失败和结果。

详细协作要求见 [AGENTS.md](AGENTS.md) 和 [学习约定](docs/learning-contract.md)。

旧版生成式产品代码保存在 Git tag
[`v1-ai-generated`](https://github.com/slince-zero/ai-agent-pro/tree/v1-ai-generated)，当前版本不会复制旧架构。

## License

[MIT](LICENSE)
