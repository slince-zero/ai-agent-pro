import { Router } from "express";
import type OpenAI from "openai";
import { runAgent } from "../services/agent.js";
import { prepareSse, writeSse } from "../sse/events.js";
import { isClientMessage } from "../types/chat.js";

type ChatRouterDeps = {
  openai: OpenAI;
};

export function createChatRouter({ openai }: ChatRouterDeps) {
  const router = Router();

  router.post("/", async (req, res) => {
    const controller = new AbortController();

    try {
      const { messages } = req.body;

      if (!Array.isArray(messages) || !messages.every(isClientMessage)) {
        return res
          .status(400)
          .json({ error: "messages 必须是 user/assistant 消息数组" });
      }

      prepareSse(res);

      res.on("close", () => {
        controller.abort();
      });

      await runAgent({
        openai,
        messages,
        signal: controller.signal,
        onEvent: (event) => {
          if (controller.signal.aborted || res.writableEnded) return;
          if (event.type === "tool_result") {
            writeSse(res, {
              type: "tool_result",
              toolCallId: event.toolCallId,
              name: event.name,
              preview: event.preview,
            });
            return;
          }

          writeSse(res, event);
        },
      });

      if (!controller.signal.aborted && !res.writableEnded) {
        writeSse(res, { type: "done" });
        res.end();
      }
    } catch (error) {
      // 客户端主动断开 → 静默退出，不写错误日志
      if (controller.signal.aborted) return;

      req.log.error({ err: error }, "Chat API error");

      if (res.headersSent) {
        if (!res.writableEnded) {
          writeSse(res, {
            type: "error",
            error: "请求处理失败，请查看 server 终端日志。",
          });
          res.end();
        }
        return;
      }

      if (!res.writableEnded) {
        res
          .status(500)
          .json({ error: "请求处理失败，请查看 server 终端日志。" });
      }
    }
  });

  return router;
}
