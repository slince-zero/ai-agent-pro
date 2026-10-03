# 评测

`pnpm test` 回答"代码有没有写对"：模型是注入的假模型，结果确定，进 CI。
`pnpm eval` 回答"系统表现得好不好"：调用真实的 DeepSeek 和 Tavily，结果有随机性，要花钱，
所以不进 CI，也不按通过与否退出——它产出一份报告，用来和改动前的那一份比较。

## 三层评测

| 套件            | 评的是                                      | 成本                | 需要的 key                         |
| --------------- | ------------------------------------------- | ------------------- | ---------------------------------- |
| `intent`        | `extractRetrievalIntent`：一句话 → 检索意图 | 每条一次模型请求    | `OPENAI_API_KEY`                   |
| `intent-update` | `updateRetrievalIntent`：意图 + 修改指令    | 每条一次模型请求    | `OPENAI_API_KEY`                   |
| `agent`         | `askAgentStream` 的整条链路                 | 多轮模型 + 真实检索 | `OPENAI_API_KEY`、`TAVILY_API_KEY` |

不点名时只跑前两套。`agent` 每条都会真的搜索和读页，要显式点名才跑。

## 怎么跑

```bash
pnpm eval                                  # intent + intent-update，各跑一遍
pnpm eval --repeat 3                       # 每条跑三遍，看稳定性
pnpm eval agent                            # 端到端
pnpm eval agent --case fact-express-node   # 只跑一条
pnpm eval intent agent --concurrency 2
```

终端里只列没全过的用例和失败的检查项；完整结果（每次运行的模型输出、答案、工具调用、
token 用量）写进 `packages/server/eval-reports/`，文件名带时间和套件名，不进 Git。
报告头部记着模型名和 Git revision（有未提交改动时带 `-dirty`），比较两份报告前先看这两项。

## 怎么判分

**没有总分，只有一串能单独读懂的检查。** 评测要回答的是"哪一类条件分错了"，
一个 0.83 说明不了这件事。一条用例的所有检查都通过才算通过；`--repeat 3` 时看的是
"3 次里过了几次"。

### 意图（`intent`、`intent-update`）

期望写成片段匹配：忽略大小写和空白的子串，给数组表示几种说法命中任意一种即可。
模型不会逐字复述用户的话，所以片段要挑最不可能被改写的那个词。

```json
{
  "id": "preference-not-promoted",
  "why": "只有'最好''优先'，没有任何硬条件：偏好不能被升级成硬条件",
  "input": "推荐几个 Node.js 的 ORM，最好支持 SQLite，优先选 GitHub star 多的。",
  "expect": {
    "hardConstraints": { "lacks": ["SQLite", ["star", "星"]] },
    "preferences": { "has": ["SQLite", ["star", "星"]] },
    "exclusions": { "empty": true }
  }
}
```

| 写法                              | 含义                               |
| --------------------------------- | ---------------------------------- |
| `"target": "ORM"`                 | target 包含 ORM                    |
| `"language": null`                | language 必须是 null               |
| `"timeRange": ["半年", "6 个月"]` | timeRange 非 null 且包含其中之一   |
| 不写某个键                        | 不检查                             |
| `{ "has": [...] }`                | 每个片段都要被数组里某一条命中     |
| `{ "lacks": [...] }`              | 数组里任何一条都不能命中这些片段   |
| `{ "empty": true }`               | 数组必须为空（`false` 为必须非空） |

`lacks` 是这一层最有用的检查：它抓的是"偏好被升级成硬条件"这类错位，而这种错位会让
后面的检索把本该保留的结果淘汰掉。

`intent-update` 多一个 `unchanged`：列出的字段必须和更新前完全一样。条件更新最怕的
不是没改对，而是顺手改掉了不相干的东西。

模型输出过不了 schema 校验（JSON 不合法、字段类型不对、被截断）时，这条用例只有一条
失败的检查"输出通过 schema 校验"。这也是这一层最常见的失败，报告里能看到具体的错误。

### Agent（`agent`）

每次运行都检查五条**不变量**。它们来自 `agent.ts` 里的 system prompt，和问题无关，
不需要标准答案——规则本身就是答案：

1. 正常结束（收到 `done`，循环没有抛错）；
2. 答案非空；
3. 答案里的每个 `[n]` 都能在 `evidence` 事件里找到；
4. 答案里没有裸链接；
5. 每条"已确认"的结论至少引用一个 `read: true` 的来源——只有搜索摘要撑着的"已确认"
   就是违反证据纪律。

用例自己的期望：

| 字段          | 含义                                         |
| ------------- | -------------------------------------------- |
| `tools`       | `none`：不该联网；`required`：至少调一次工具 |
| `readPage`    | 至少成功读回一页正文                         |
| `checklist`   | 答案里有"条件核对"一段                       |
| `answerHas`   | 最终答案必须命中的片段                       |
| `answerLacks` | 最终答案不能出现的片段                       |

"最终答案"是最后一轮的正文；前几轮的"我先搜一下"不算。网页内容会变，所以事实题只挑
答案多年不变的（许可证、发布日期、最低版本），其他用例只检查行为，不检查具体结论。

终端会额外打印平均轮数、search / read_page 次数、输入 token 和耗时：这些不判对错，
但改 prompt 或预算之后，它们往往比通过率先变。

## 什么时候跑

- 改了 system prompt、意图解析的 prompt、工具描述、`agentLimits`、上下文投影之后，
  跑对应的套件，把终端里的摘要贴进 PR 的"结果"一节；
- 换模型之后，三套都跑，`--repeat 3`；
- 在真实使用里看到一次失败：先把它写成一条用例，确认它能复现，再去修。

## 怎么加一条用例

1. 在 `packages/server/src/evals/cases/<suite>.json` 里加一项；
2. `why` 写清楚它在测什么——写不出来，说明这条用例不该存在；
3. `pnpm test` 会校验所有用例文件：字段名写错会被拒绝，而不是悄悄变成"不检查"；
4. `pnpm eval <suite> --case <id> --repeat 3` 确认它稳定地过或稳定地挂。

时好时坏的用例先看报告里的模型输出：是片段挑得太窄（改用例），还是模型真的不稳定（留着它）。

## 基线

2026-10-01，`deepseek-v4-flash`，`--repeat 3`。

| 套件            | 用例全过     | 检查通过率 | 没全过的用例                                                                  |
| --------------- | ------------ | ---------- | ----------------------------------------------------------------------------- |
| `intent`        | 17/19        | 98.6%      | `vague-to-ambiguity` 0/3、`english-input` 2/3                                 |
| `intent-update` | 10/11        | 99.7%      | `demote-hard` 2/3                                                             |
| `agent`         | 未跑完整套件 | —          | 本机没有 `TAVILY_API_KEY`，只验证了 `translate-no-tools`、`chitchat-no-tools` |

这一版基线之前，意图解析请求没有关掉 DeepSeek v4 默认开启的思考模式，思维链和 JSON 共用
`max_tokens: 800`，`intent` 里 19 条有 6 条因为输出被截成空串而失败（13/19）；
循环会吞掉这个错误、当作没有意图继续跑，所以线上从来看不出来。

仍然没过的几条都是模型行为，不是用例写错：

- `vague-to-ambiguity`：模型稳定地把"不要太长""通俗一点"放进 `preferences`，
  而产品计划把这类条件定义为需要澄清的模糊条件。要么改 prompt，要么改定义；
- `english-input`：偶尔把 `timeRange` 输出成对象而不是字符串；
- `demote-hard`：偶尔在没被要求的情况下把 `contentType` 清成 null。
