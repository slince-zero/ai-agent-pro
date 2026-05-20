import { Router } from "express";
import type OpenAI from "openai";
import { runAgent } from "../services/agent.js";
import { prepareSse, writeSse } from "../sse/events.js";
import { isClientMessage } from "../types/chat.js";

type ChatRouterDeps = {
  openai: OpenAI | null;
};

export function createChatRouter({ openai }: ChatRouterDeps) {
  const router = Router();

  router.post("/", async (req, res) => {
    try {
      const { messages } = req.body;

      if (!Array.isArray(messages) || !messages.every(isClientMessage)) {
        return res
          .status(400)
          .json({ error: "messages 必须是 user/assistant 消息数组" });
      }

      if (!openai) {
        return res
          .status(500)
          .json({ error: "缺少 OPENAI_API_KEY 环境变量" });
      }

      prepareSse(res);

      const signal = { aborted: false };
      res.on("close", () => {
        signal.aborted = true;
      });

      await runAgent({
        openai,
        messages,
        signal,
        onEvent: (event) => {
          if (signal.aborted || res.writableEnded) return;
          writeSse(res, event);
        },
      });

      if (!signal.aborted && !res.writableEnded) {
        writeSse(res, { type: "done" });
        res.end();
      }
    } catch (error) {
      console.error("Chat API 错误：", error);

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
