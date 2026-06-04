import { Router } from "express";
import type OpenAI from "openai";
import { z } from "zod";
import { prisma } from "../db/client.js";
import {
  MessageRole,
  Prisma,
  RunStatus,
  SessionStatus,
  ToolCallStatus,
} from "../generated/prisma/client.js";
import { runAgent } from "../services/agent.js";
import { MODEL } from "../services/openai.js";
import { getCurrentUser } from "../services/users.js";
import { prepareSse, writeSse } from "../sse/events.js";
import type { ClientMessage } from "../types/chat.js";

type SessionsRouterDeps = {
  openai: OpenAI;
};

const createSessionSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

const createMessageSchema = z
  .object({
    content: z.string().trim().min(1).max(30_000),
  })
  .strict();

function toTitle(content: string) {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (!normalized) return "新对话";
  return normalized.length > 40 ? `${normalized.slice(0, 40)}...` : normalized;
}

function toClientRole(role: MessageRole): ClientMessage["role"] | null {
  if (role === MessageRole.USER) return "user";
  if (role === MessageRole.ASSISTANT) return "assistant";
  return null;
}

function serializeSession(session: {
  id: string;
  title: string;
  status: SessionStatus;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: session.id,
    title: session.title,
    status: session.status.toLowerCase(),
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  };
}

function serializeMessage(message: {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: Date;
}) {
  return {
    id: message.id,
    role: message.role.toLowerCase(),
    content: message.content,
    createdAt: message.createdAt.toISOString(),
  };
}

function toJsonValue(value: unknown) {
  return value === undefined ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
}

export function createSessionsRouter({ openai }: SessionsRouterDeps) {
  const router = Router();

  router.get("/", async (_req, res) => {
    try {
      const user = await getCurrentUser();
      const sessions = await prisma.session.findMany({
        where: {
          userId: user.id,
          status: SessionStatus.ACTIVE,
        },
        orderBy: {
          updatedAt: "desc",
        },
        take: 50,
      });

      res.json({ sessions: sessions.map(serializeSession) });
    } catch (error) {
      console.error("获取会话列表失败：", error);
      res.status(500).json({ error: "获取会话列表失败" });
    }
  });

  router.post("/", async (req, res) => {
    const parsed = createSessionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "会话参数无效" });
    }

    try {
      const user = await getCurrentUser();
      const session = await prisma.session.create({
        data: {
          userId: user.id,
          title: parsed.data.title ?? "新对话",
        },
      });

      res.status(201).json({ session: serializeSession(session) });
    } catch (error) {
      console.error("创建会话失败：", error);
      res.status(500).json({ error: "创建会话失败" });
    }
  });

  router.get("/:sessionId/messages", async (req, res) => {
    try {
      const user = await getCurrentUser();
      const session = await prisma.session.findFirst({
        where: {
          id: req.params.sessionId,
          userId: user.id,
          status: SessionStatus.ACTIVE,
        },
      });

      if (!session) {
        return res.status(404).json({ error: "会话不存在" });
      }

      const messages = await prisma.message.findMany({
        where: {
          sessionId: session.id,
          role: {
            in: [MessageRole.USER, MessageRole.ASSISTANT],
          },
        },
        orderBy: {
          createdAt: "asc",
        },
      });

      res.json({ messages: messages.map(serializeMessage) });
    } catch (error) {
      console.error("获取消息失败：", error);
      res.status(500).json({ error: "获取消息失败" });
    }
  });

  router.post("/:sessionId/messages", async (req, res) => {
    const parsed = createMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "消息内容无效" });
    }

    const content = parsed.data.content;
    const user = await getCurrentUser();
    const session = await prisma.session.findFirst({
      where: {
        id: req.params.sessionId,
        userId: user.id,
        status: SessionStatus.ACTIVE,
      },
    });

    if (!session) {
      return res.status(404).json({ error: "会话不存在" });
    }

    const userMessage = await prisma.message.create({
      data: {
        sessionId: session.id,
        role: MessageRole.USER,
        content,
      },
    });

    if (session.title === "新对话") {
      await prisma.session.update({
        where: {
          id: session.id,
        },
        data: {
          title: toTitle(content),
        },
      });
    }

    const run = await prisma.agentRun.create({
      data: {
        sessionId: session.id,
        userMessageId: userMessage.id,
        model: MODEL,
      },
    });

    prepareSse(res);

    const signal = { aborted: false };
    const toolCallIds = new Map<string, string>();
    let assistantText = "";
    let runError: string | null = null;

    res.on("close", () => {
      signal.aborted = true;
    });

    try {
      const dbMessages = await prisma.message.findMany({
        where: {
          sessionId: session.id,
          role: {
            in: [MessageRole.USER, MessageRole.ASSISTANT],
          },
        },
        orderBy: {
          createdAt: "asc",
        },
        take: 30,
      });

      const messages = dbMessages
        .map((message) => {
          const role = toClientRole(message.role);
          return role ? { role, content: message.content } : null;
        })
        .filter((message): message is ClientMessage => message !== null);

      await runAgent({
        openai,
        messages,
        signal,
        onEvent: async (event) => {
          if (event.type === "text") {
            assistantText += event.text;
            if (!signal.aborted && !res.writableEnded) {
              writeSse(res, event);
            }
            return;
          }

          if (event.type === "tool_call") {
            const toolCall = await prisma.toolCall.create({
              data: {
                runId: run.id,
                toolCallId: event.toolCallId,
                name: event.name,
                arguments: toJsonValue(event.args),
              },
            });
            toolCallIds.set(event.toolCallId, toolCall.id);

            if (!signal.aborted && !res.writableEnded) {
              writeSse(res, event);
            }
            return;
          }

          if (event.type === "tool_result") {
            const id = toolCallIds.get(event.toolCallId);
            if (id) {
              await prisma.toolCall.update({
                where: {
                  id,
                },
                data: {
                  result: event.result,
                  status: ToolCallStatus.COMPLETED,
                  finishedAt: new Date(),
                },
              });
            } else {
              await prisma.toolCall.create({
                data: {
                  runId: run.id,
                  toolCallId: event.toolCallId,
                  name: event.name,
                  result: event.result,
                  status: ToolCallStatus.COMPLETED,
                  finishedAt: new Date(),
                },
              });
            }

            if (!signal.aborted && !res.writableEnded) {
              writeSse(res, {
                type: "tool_result",
                toolCallId: event.toolCallId,
                name: event.name,
                preview: event.preview,
              });
            }
            return;
          }

          runError = event.error;
          if (!signal.aborted && !res.writableEnded) {
            writeSse(res, event);
          }
        },
      });

      const assistantMessage = assistantText.trim()
        ? await prisma.message.create({
            data: {
              sessionId: session.id,
              role: MessageRole.ASSISTANT,
              content: assistantText,
            },
          })
        : null;

      await prisma.agentRun.update({
        where: {
          id: run.id,
        },
        data: {
          assistantMessageId: assistantMessage?.id,
          status: signal.aborted
            ? RunStatus.CANCELED
            : runError
              ? RunStatus.FAILED
              : RunStatus.COMPLETED,
          error: runError,
          finishedAt: new Date(),
        },
      });

      await prisma.session.update({
        where: {
          id: session.id,
        },
        data: {
          updatedAt: new Date(),
        },
      });

      if (!signal.aborted && !res.writableEnded) {
        writeSse(res, { type: "done" });
        res.end();
      }
    } catch (error) {
      console.error("会话消息处理失败：", error);

      await prisma.agentRun.update({
        where: {
          id: run.id,
        },
        data: {
          status: signal.aborted ? RunStatus.CANCELED : RunStatus.FAILED,
          error: (error as Error).message,
          finishedAt: new Date(),
        },
      });

      if (!signal.aborted && !res.writableEnded) {
        writeSse(res, {
          type: "error",
          error: "请求处理失败，请查看 server 终端日志。",
        });
        res.end();
      }
    }
  });

  return router;
}
