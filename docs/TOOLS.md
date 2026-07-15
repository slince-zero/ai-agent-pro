# Tool SDK 开发指南

`@ai-agent-pro/tool-sdk` 是仓库内所有 Agent tool 的公共契约。它负责类型推导、定义校验和
plugin 分组；server runtime 负责参数校验、超时、取消、日志和结果记录。

当前 plugin 是声明式工具集合，不包含 npm 动态安装或目录扫描。新增可信工具时需要显式注册；
Plugin 的 `run` 函数仍在 Agent server 进程中执行，不能用来运行不可信代码。不可信的短代码片段
应通过受限的 [`code_execute` Docker 沙箱](CODE_SANDBOX.md) 执行。

## 定义一个工具

```ts
import { defineTool } from '@ai-agent-pro/tool-sdk'
import { z } from 'zod'

export const wordCountTool = defineTool({
  name: 'word_count',
  description: 'Counts words and characters in a text value.',
  governance: {
    category: 'code',
    sideEffect: false,
    requiresAuth: false,
    timeoutMs: 1_000,
  },
  schema: z.object({
    text: z.string().min(1).describe('Text to inspect.'),
  }),
  run: ({ text }, { signal }) => {
    signal.throwIfAborted()
    return JSON.stringify({ words: text.trim().split(/\s+/).length })
  },
})
```

`defineTool` 会从 Zod schema 生成模型使用的 JSON Schema。动态工具已经持有 JSON Schema
时，也可以显式传入 `parameters`；无论哪种方式，顶层参数必须是 object schema。

工具定义需要满足以下约定：

- `name` 只能包含字母、数字、下划线和连字符，长度为 1-64。
- `description` 应说明何时使用、输入范围和不适用场景。
- `schema` 是运行时参数校验的唯一事实来源，字段说明使用 Zod `.describe()`。
- `run` 返回 string；结构化结果使用 `JSON.stringify`，执行失败直接抛出 `Error`。
- `run` 必须响应 `context.signal`，网络请求应把它传给 `fetch`。
- `sideEffect` 标记写操作，`requiresAuth` 标记是否依赖凭据，`timeoutMs` 必须为正数。

## 组合 plugin

```ts
import { definePlugin } from '@ai-agent-pro/tool-sdk'

export const textPlugin = definePlugin({
  name: 'text-tools',
  version: '0.1.0',
  tools: [wordCountTool],
})
```

`definePlugin` 会校验 plugin 名称、版本、每个工具定义以及重复工具名。完整可运行代码见
[`examples/simple-tool`](../examples/simple-tool)。

## 注册到 server

可信的内置工具采用显式注册。将工具导入 `packages/server/src/tools/index.ts`，再加入
`builtinPlugin.tools`：

```ts
const builtinPlugin = definePlugin({
  name: 'builtin',
  version: '1.0.0',
  tools: [githubRepoTool, webFetchTool, wordCountTool],
})
```

外部 MCP server 的工具由 `MCP_SERVERS_JSON` 自动发现，它们会被转换成同一个 `AppTool`
契约后再进入 registry。

## 运行生命周期

1. 注册：`defineTool` / `definePlugin` 提前拒绝不兼容的定义和重复名称。
2. 暴露：runtime 只把 name、description 和 JSON Schema 发送给模型。
3. 校验：模型返回参数后，server 使用 Zod `safeParse` 校验和转换。
4. 执行：runtime 创建 `AbortSignal`，应用 `timeoutMs` 并调用 `run`。
5. 记录：结果统一转换为 completed/failed，记录耗时和错误，再写入 trace。

超时或上游请求取消时，signal 会 abort。工具应停止网络、文件或子进程工作；不要吞掉取消后
继续产生副作用。

## 开发与测试

```bash
# 运行 SDK 和示例测试
pnpm --filter @ai-agent-pro/tool-sdk test
pnpm --filter @ai-agent-pro/example-simple-tool test

# 完整仓库门禁
pnpm typecheck
pnpm lint:ci
pnpm test
pnpm build
```

每个工具至少覆盖成功执行、非法参数、上游失败和取消/超时路径。新增工具不能在测试中依赖真实
外部服务，应 mock 网络或 provider 边界。
