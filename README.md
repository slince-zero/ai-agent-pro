# ai-agent-pro

一个从零实现的 GitHub 仓库理解 Agent 学习项目。

目标不是尽快做出一个功能很多的 AI 产品，而是亲手理解以下问题：

- 模型的流式 API 如何工作？
- 模型如何选择并调用工具？
- Agent loop 与固定 workflow 有什么区别？
- 如何安全地读取和搜索代码仓库？
- 什么内容应该进入上下文？
- 如何让答案带有可验证的文件和行号引用？
- 如何证明一次修改真的提高了仓库问答质量？

旧版产品代码保存在 Git tag [`v1-ai-generated`](https://github.com/slince-zero/ai-agent-pro/tree/v1-ai-generated)。
新版本不会复制旧架构。

## 当前状态

目前只有一个可运行的 TypeScript CLI 骨架，没有模型调用、仓库工具或 Agent：

```bash
pnpm install
pnpm dev -- help
```

当前没有模型调用，因此也不需要 API Key。

## 学习顺序

### 1. Raw streaming model client

直接使用标准 `fetch` 调用一个 OpenAI-compatible API，亲手处理请求、SSE 流、错误、超时和
Token usage。不要使用 Agent framework。

### 2. Safe repository tools

实现并单独测试：

- `list_files`
- `read_file`
- `search_code`
- `find_symbol`

工具必须限制在目标仓库内，并处理路径穿越、符号链接、二进制文件和超大文件。

### 3. Minimal Agent loop

让模型在最多 N 轮内选择工具、观察结果、继续检索或输出答案。工具失败也要作为观察结果返回
模型，而不是由程序隐藏。

### 4. Citations

每个结论都应能够关联到具体文件和行号。证据不足时必须明确回答无法确认。

### 5. Lexical retrieval baseline

先使用文件名、代码标识符和 `rg`/FTS 做基线，再实验 Embedding、hybrid search 和 reranking。
后者只有在 Eval 证明收益后才保留。

### 6. Repository QA Eval

使用 [`fixtures/tiny-service`](fixtures/tiny-service) 和
[`evals/repository-qa.json`](evals/repository-qa.json) 比较正确率、引用准确率、Token、延迟和
工具调用次数。

## 项目边界

当前明确不做：

- React/Web UI
- 登录注册与支付
- PostgreSQL、Prisma、向量数据库
- Memory 与长会话
- MCP、插件 SDK、代码沙箱
- Planner/Executor/Critic 多 Agent
- 后台队列和分布式任务状态机

这些能力只有在仓库问答 Eval 暴露真实需求后才能重新进入计划。

## 目录

```text
src/                       CLI 和未来的 Agent 核心
fixtures/tiny-service/     固定、可验证的微型仓库
evals/repository-qa.json   第一批仓库理解问题与证据
docs/                      学习约定和决策记录
```

## 开发命令

```bash
pnpm fmt
pnpm typecheck
pnpm lint:ci
pnpm test
pnpm build
```

## AI 使用原则

AI 默认负责拆解、提示、解释文档、review 和补充测试。核心模块由项目所有者先写第一版；无法
逐行解释的代码不合并。详细规则见 [AGENTS.md](AGENTS.md) 和
[学习约定](docs/learning-contract.md)。
