# Docker 代码沙箱

`code_execute` 在短生命周期 Docker 容器中执行 JavaScript 或 Python。该工具默认关闭，适合做
计算、解析和算法验证，不适合构建项目、安装依赖或处理持久化文件。

## 启用

先准备 Docker daemon 和允许使用的镜像。执行阶段使用 `--pull never`，不会自动下载镜像：

```bash
docker pull node:22-alpine
docker pull python:3.13-alpine
```

在 `packages/server/.env` 中启用：

```env
CODE_SANDBOX_ENABLED=true
CODE_SANDBOX_DOCKER_BINARY=docker
CODE_SANDBOX_JAVASCRIPT_IMAGE=node:22-alpine
CODE_SANDBOX_PYTHON_IMAGE=python:3.13-alpine
```

生产部署应把镜像配置成经过审核的 digest，例如 `image@sha256:...`，避免 tag 更新带来未审计
的运行环境变化。镜像由服务端配置固定，模型不能提供 image、entrypoint 或 Docker 参数。

启用后，Agent 会看到 `code_execute` 工具。最小调用参数：

```json
{
  "language": "javascript",
  "code": "console.log([1, 2, 3].reduce((a, b) => a + b, 0))"
}
```

## 隔离边界

每次执行都会创建新容器，并强制应用以下限制：

| 边界     | 当前策略                                                             |
| -------- | -------------------------------------------------------------------- |
| 网络     | `--network none`，容器只有 loopback。                                |
| 文件系统 | 只读 rootfs；只提供 16 MiB、`noexec/nosuid/nodev` 的临时 `/tmp`。    |
| 宿主文件 | 不使用 volume、bind mount 或工作区挂载。                             |
| 权限     | UID/GID `65534:65534`、drop all capabilities、`no-new-privileges`。  |
| 进程     | 最多 64 PIDs，最多 64 个文件描述符。                                 |
| 资源     | 128 MiB memory + swap、0.5 CPU。                                     |
| 时间     | 默认 5 秒；调用方可设 100-10000 ms，超过后强制删除容器。             |
| 输入     | 最多 20000 字符，通过 stdin 写入固定脚本路径，不拼接到 Docker 参数。 |
| 输出     | stdout + stderr 合计最多 64 KiB，超过后截断并强制删除容器。          |
| 生命周期 | `--init` 回收子进程，`--rm` 自动清理；异常路径额外执行强制删除。     |

容器使用 Docker 默认 seccomp 配置。沙箱不会转发 Agent server 的环境变量或密钥，也不支持用户
选择镜像、挂载、网络、环境变量或启动命令。

## Docker socket 风险

访问 Docker daemon 本身是高权限操作。把 `/var/run/docker.sock` 挂进应用容器，通常等同于授予
应用控制 Docker 宿主机的权限；容器内的资源限制不能降低 socket 泄露带来的风险。

- 本地开发优先让 server 直接运行在宿主机，通过本机 Docker CLI 访问 Docker Desktop。
- 生产环境使用专用、最小权限的 Docker daemon/VM，只承载沙箱容器；不要连接共享生产宿主。
- 使用远端 daemon 时，通过 Docker CLI 支持的 `DOCKER_HOST` 和 TLS 配置连接，并隔离网络入口。
- 基础 `docker-compose.yml` 不挂载 socket，也不会默认启用沙箱。

项目生产镜像包含 Docker CLI。如需仅在本地 Compose 中验证，可创建不提交的 override 文件挂载
socket 并设置 `CODE_SANDBOX_ENABLED=true`；不要把该配置直接用于公网多租户环境。

## 运维检查

启用前确认镜像已存在且 daemon 可用：

```bash
docker image inspect node:22-alpine
docker image inspect python:3.13-alpine
docker info
```

单元测试不会连接真实 daemon；它们验证完整 Docker 参数、stdin 传输、输出上限、超时、取消和
强制清理。上线前应在目标隔离环境中执行一次受控 smoke test，并确认无网络、无宿主挂载。
