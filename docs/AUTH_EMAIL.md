# 账户邮件与密码恢复

应用使用 Better Auth 管理邮箱密码账户，并在服务端固定构造验证和密码重置链接。客户端提交的
callback URL 不会进入邮件，避免开放重定向。

## 本地开发

开发环境默认使用 `console` provider，不访问外部邮件服务：

```env
AUTH_EMAIL_PROVIDER=console
AUTH_APP_URL=http://localhost:5173/app
```

注册、重发验证邮件或找回密码后，在 server 日志中查找 `development email captured`。
日志包含收件人、正文和一次性操作链接，只能用于本地开发，不能用于共享或生产环境。

## 生产环境

生产环境当前使用 [Resend Email API](https://resend.com/docs/api-reference/emails/send-email)：

```env
NODE_ENV=production
BETTER_AUTH_URL=https://agent.example.com
AUTH_APP_URL=https://agent.example.com/app
AUTH_EMAIL_PROVIDER=resend
AUTH_EMAIL_FROM=AI Engineering Agent <auth@agent.example.com>
RESEND_API_KEY=re_xxx
```

部署前需要在 Resend 验证发件域名。`BETTER_AUTH_URL` 是外部可访问的服务端根 URL，
`AUTH_APP_URL` 是邮件完成操作后返回的工作区 URL；存在公开站点时建议使用 `/app` 路径。两者必须使用受信任的 HTTPS 地址。
前后端同域部署时可设为相同值。

## 安全行为

- 注册后必须先验证邮箱，验证前不会创建登录会话。
- 邮箱验证链接 30 分钟有效；同一用户重发后旧链接失效，每个链接只能使用一次。
- 密码重置链接 15 分钟有效且只能使用一次；重置成功会吊销该用户的所有旧会话。
- 找回密码和重发验证接口不会通过响应泄露账户是否存在。
- Better Auth 提供 IP 维度限流；应用额外按邮箱哈希限制为每类操作 15 分钟 3 次。
- 邮件链接只基于服务端环境变量生成，不接受请求方提供的跳转目标。
- 密码重置 token 放在 URL fragment 中，不会发送到前端静态服务器或进入 Referer。

账户限流目前是进程内固定窗口。单实例部署可以直接使用；多实例或无状态部署必须改用 Redis
等共享存储，否则每个实例会独立计数。邮件发送失败时账户保持未验证，用户可以稍后重发。

## 测试

测试通过内存邮件 sender 捕获链接，不调用真实 Resend API。测试覆盖验证链接过期、伪造、
重复使用、重发失效，以及密码重置后旧会话失效。Resend adapter 测试只验证 HTTP 请求边界，
不会发送真实邮件。
