# 生产 API 安全指南

## 强制配置

生产环境启动时会校验 `BETTER_AUTH_SECRET`、`BETTER_AUTH_URL`、事务邮件配置和
`TRUST_PROXY`。服务拒绝开发默认密钥以及 `true`、`*`、`0.0.0.0/0`、`::/0` 等无限代理
信任配置。

`TRUST_PROXY=1` 只适用于应用前恰好一层受控反向代理。代理层级不固定时应改为明确的
IP、CIDR 或 Express 命名子网，例如 `TRUST_PROXY=loopback,10.0.0.0/8`。错误配置会让
攻击者伪造客户端 IP，绕过 IP 限流。

反向代理必须：

- 覆盖客户端传入的 `X-Forwarded-For`，只追加代理实际看到的来源地址。
- 限制请求体不超过 `API_MAX_BODY_BYTES`，包括没有 `Content-Length` 的 chunked/HTTP2 请求。
- 保持 SSE 长连接和 heartbeat，不给 `/api/sessions/:id/messages` 设置短响应超时。
- 仅通过 HTTPS 暴露服务；生产认证 Cookie 已启用 `Secure`。

## Origin 与浏览器防护

`BETTER_AUTH_URL`、`AUTH_APP_URL` 和 `AUTH_TRUSTED_ORIGINS` 共同组成精确 Origin 白名单。
生产环境不反射任意 Origin。携带认证 Cookie 的写请求必须带可信 `Origin`，明确的
cross-site 写请求会被拒绝。服务同时返回 CSP、HSTS、`nosniff`、frame deny、referrer 和
permissions policy 等响应头。

`/api/webhooks/*` 为无 Cookie 的机器请求保留 Origin 例外。每个实际 webhook route 必须在
读取业务数据前验证 provider 签名、时间戳和重放窗口；Origin 不是 webhook 身份校验手段。

## 默认限额

| 范围               | 身份键    | 默认策略                       |
| ------------------ | --------- | ------------------------------ |
| `/api/auth/*`      | 客户端 IP | 60 次 / 15 分钟                |
| 其他 `/api/*`      | 客户端 IP | 300 次 / 15 分钟               |
| 新建或重新生成 run | 用户 ID   | 10 次 / 15 分钟，最多 2 个并发 |

429 响应包含稳定错误码和 `Retry-After`/标准 RateLimit 响应头。run 并发槽会保持到 SSE
完成或客户端断开，但不会因为限流窗口而主动终止已开始的 stream。

当前限流器和并发计数器使用进程内存，只适用于单实例部署。扩展到多实例前，必须将 API
限流、run 并发和账户邮件限流迁移到 Redis 等共享、原子存储；同时使用一致的代理信任配置。

应用会限制 JSON 和认证 form body，包括 chunked 请求；认证端点拒绝其他 media type。代理
仍须在连接层执行相同上限，以免超大请求在到达 Node.js 前占用带宽和连接。

## 工具与索引硬限制

工具没有独立的公网 HTTP endpoint，只能在已认证 agent run 内执行，并受 run 频率和并发
限制。服务层还会执行以下不可由模型放宽的限制：

- `web_fetch`：10 秒、1 MB 响应、30,000 文本字符、最多 5 次重定向，并逐跳执行 SSRF 校验。
- `code_execute`：20,000 代码字符、10 秒、64 KiB 输出；容器无网络和宿主文件访问。
- GitHub 索引：默认最多 80 个文件、单文件 120,000 bytes、目录树 500 项、chunk 4,000 字符。

生产环境仍应使用网络出口策略限制 `web_fetch`，并在独立 daemon 或 VM 中运行代码沙箱。

## 错误与日志

API 错误保留 `error` 文本，并增加稳定 `code` 和可用时的 `requestId`。客户端应按 `code`
处理 401、403、404、409、413、414、422、429，不应解析文本。

请求日志只记录方法、脱敏 URL、request ID 和网络地址。Authorization、Cookie、API key、
密码、token 和 webhook signature 会被遮蔽。新增日志字段时仍应避免记录原始请求 body 或
第三方 provider 响应中的凭据。
