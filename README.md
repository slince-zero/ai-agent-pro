# Context

一个从零实现的、以上下文为中心的智能检索 Agent。

它尝试把“帮我找一些符合这些条件的内容”这类模糊需求，转换为可执行、可追踪、可验证的检索过程。
项目不依赖 Agent framework，目标是在真实代码中理解模型协议、工具调用、Agent loop、上下文选择与证据处理。

![Context 首页](docs/assets/homepage.png)

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

## 当前进度

项目已经完成一条可运行的 DeepSeek 对话链路，为后续接入搜索和页面读取工具打下基础：

- React 19 + Vite 8 + Tailwind CSS 4 对话界面；
- Express 5 服务端与 OpenAI-compatible DeepSeek 客户端；
- 基于 NDJSON 的流式响应；
- 多轮消息上下文传递；
- Markdown / GFM 内容渲染；
- 输入、输出和总 Token 用量展示；
- 请求校验、流式错误事件与 Agent 核心测试。

目前它还是“对话模型原型”，**尚未实现真正的互联网检索**。搜索工具、页面读取、约束解析、
候选过滤、证据上下文和完整 Agent loop 会在接下来的小步迭代中逐个加入。

## 上下文设计

Context 不把上下文简单理解为无限增长的聊天记录，而是计划维护四类有边界的状态：

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
`http://127.0.0.1:3001`。

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
  client/       React 对话界面、流式事件消费与状态展示
  server/       Express API、DeepSeek 调用与 Agent 核心
  shared/       前后端共享的消息和流式事件类型
docs/
  product-plan.md       产品范围、实施顺序与验收标准
  learning-contract.md  Learning-first 协作约定
  decisions/            架构决策记录
```

## 接下来要做

- [ ] 搜索工具与统一结果类型
- [ ] 页面读取和正文提取
- [ ] 原始工具调用协议与 Agent loop
- [ ] 目标、硬条件、排除条件和软偏好的结构化表达
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
