# Multi-Agent 工作流

Multi-Agent v1 为复杂工程任务提供显式的 Plan-Execute-Review 流程。它是现有单 Agent 工具循环
之外的可选路径，不会自动接管普通聊天。

## 角色

| 角色     | 职责                                                   | 工具权限 |
| -------- | ------------------------------------------------------ | -------- |
| Planner  | 分析目标、约束和风险，生成 Executor 与 Critic 的计划。 | 无       |
| Executor | 按计划解决问题，复用现有 Agent 工具循环生成候选答案。  | 有       |
| Critic   | 审查候选答案并修正问题，输出交付给用户的最终答案。     | 无       |

Planner 和 Critic 的模型请求固定传入空 tools 数组。Executor 是唯一能调用工具的阶段，沿用现有
ToolRunner 的校验、超时、取消和记录策略。

## 运行协议

```text
context -> Planner plan
context + plan -> Executor draft + tool calls
context + plan + draft -> Critic final answer
```

1. ChatService 创建 `AgentRun(workflow=multi_agent)` 并返回 `run_id` SSE event。
2. 每个角色开始时创建一条 `AgentStage(status=running)`。
3. 阶段完成后保存输出、输入/输出 token、结束时间和 `completed` 状态。
4. Executor 的草稿只写入 trace，不直接发送给用户；工具事件仍正常通过 SSE 输出。
5. Critic 的文本作为最终助手回复流式输出并落库。
6. 三阶段 usage 汇总到 AgentRun，用于统一成本计算。

阶段失败会停止后续阶段。当前阶段标记为 `failed`；客户端断开导致的取消标记为 `canceled`，
AgentRun 也会进入对应状态。已经完成的阶段仍保留，便于在 Runs 页面定位失败位置。

## API

消息接口通过 `workflow` 显式选择运行路径：

```http
POST /api/sessions/:sessionId/messages
Content-Type: application/json

{
  "content": "分析这个项目的认证设计并给出迁移计划",
  "workflow": "multi_agent"
}
```

支持的值：

- `single`：现有单 Agent 工具循环。
- `multi_agent`：Planner、Executor、Critic 三阶段工作流。
- 省略：等同于 `single`，兼容现有客户端。

`POST /api/sessions/:sessionId/regenerate` 同样接受可选 `workflow`。Web UI 输入区提供对应的
分段选择控件。

## Trace

`GET /api/runs` 返回 workflow 和阶段状态摘要；`GET /api/runs/:runId` 还会返回每个阶段的完整
output、error、usage 和时间信息。Runs 页面按 sequence 展示 Planner、Executor、Critic。

## 取舍

- 多 Agent 至少产生三个模型阶段，延迟和 token 成本通常高于单 Agent。
- v1 使用线性、确定性的三阶段状态机，不做并行子任务、自动复杂度路由或递归 Agent。
- 阶段共享同一份预算化上下文；只有 Executor 能执行工具，降低重复调用与权限扩散风险。
- 对简单问答应继续使用 `single`。多 Agent 适合需要规划、工具验证和交付前审查的复杂任务。
