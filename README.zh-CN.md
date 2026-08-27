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


**检索能力的地基**

- `retrievalIntentSchema`：目标、硬条件、排除条件、软偏好与待澄清项的严格 zod schema；
- `extractRetrievalIntent()`：真实的 DeepSeek JSON 模式调用，输出必须通过上面的 schema 校验；
  模型客户端可注入，所以测试不需要联网；
- 搜索工具的调用契约（`zod` → JSON Schema），以及先校验参数再执行的分发器。

## 还没有做到

- `search()` 会主动抛出 `Search is not implemented`，只有契约存在；
- 意图抽取是一个带测试的模块，还没有接进对话请求链路；
- 没有页面读取、没有 Agent loop、没有候选过滤、没有证据上下文。

这些会一小步一小步加进来，每一步都自带测试。

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
- DeepSeek API Key

### 本地运行

```bash
git clone https://github.com/slince-zero/ai-agent-pro.git
cd ai-agent-pro
pnpm install
cp packages/server/.env.example packages/server/.env

# 编辑 packages/server/.env，填入你的 DeepSeek API Key

pnpm dev
```

启动后访问 [http://localhost:5173](http://localhost:5173)。前端开发服务器会把 `/api` 请求代理到
`http://127.0.0.1:3001`；用 `PORT` 可以换一个前端端口。

> 环境变量沿用 OpenAI SDK 的 `OPENAI_API_KEY` 命名，但当前请求会发送到 DeepSeek API。

## 常用命令

```bash
pnpm dev        # 同时启动前端和服务端
pnpm test       # 运行测试
pnpm typecheck  # TypeScript 类型检查
pnpm lint:ci    # 代码检查与格式检查
pnpm build      # 构建所有 workspace package
```

## 项目结构

```text
packages/
  client/
    src/App.tsx              对话界面：流式消费、节奏化输出、用量、停止与重试
    src/landing/             landing 页各个区块
    src/markdown.tsx         Markdown 管线：GFM、净化后的原始 HTML、图片降级
    src/mermaid-diagram.tsx  懒加载的 mermaid 渲染器，带错误边界
    src/streaming-markdown.ts 流式过程中给半个标记做临时收尾
    src/icons/               手绘风格图标集（/?icons 是总览页）
    src/util.ts              NDJSON 流式消费
  server/
    src/app.ts               Express 路由与请求校验
    src/agent.ts             DeepSeek 流式 Agent 核心
    src/retrieval/           检索意图 schema 与抽取
    src/tools/               工具契约与分发器
  shared/
    type.ts                  前后端共享的消息与流式事件类型
docs/
  product-plan.md            产品范围、实施顺序与验收标准
  learning-contract.md       Learning-first 协作约定
  decisions/                 架构决策记录
```

## 接下来要做

- [x] 带 Token 统计的流式对话链路
- [x] Markdown、mermaid 与净化后的原始 HTML 渲染
- [x] 结构化检索意图：目标、硬条件、排除条件与软偏好
- [ ] 搜索工具与统一结果类型
- [ ] 页面读取和正文提取
- [ ] 原始工具调用协议与 Agent loop
- [ ] 候选过滤、证据选择与可解释重排
- [ ] 基于后续对话增加、修改或撤销检索条件

完整计划与阶段验收标准见 [产品与工程计划](docs/product-plan.md)。

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

