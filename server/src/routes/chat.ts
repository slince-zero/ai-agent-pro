import { Router } from "express";
import type OpenAI from "openai";
import { prepareSse, writeSse } from "../sse/events.js";
import { createChatCompletionStream } from "../services/openai.js";
import { findToolForInput } from "../tools/index.js";
import { getLatestUserInput, isClientMessage } from "../types/chat.js";

type ChatRouterDeps = {
  openai: OpenAI | null;
};

export function createChatRouter({ openai }: ChatRouterDeps) {
  const router = Router();

  router.post("/", async (req, res) => {
    try {
      const { messages } = req.body;

      if (!Array.isArray(messages) || !messages.every(isClientMessage)) {
        return res.status(400).json({ error: "messages 必须是 user/assistant 消息数组" });
      }

      prepareSse(res);

      let clientClosed = false;
      res.on("close", () => {
        clientClosed = true;
      });

      const latestUserInput = getLatestUserInput(messages);
      const tool = findToolForInput(latestUserInput);

      if (tool) {
        const result = await tool.run({ input: latestUserInput });

        if (!clientClosed && !res.writableEnded) {
          writeSse(res, { type: "text", text: result.html });
          writeSse(res, { type: "done" });
          res.end();
        }

        return;
      }

      if (!openai) {
        throw new Error("缺少 OPENAI_API_KEY 环境变量");
      }

      const stream = await createChatCompletionStream(openai, messages);

      for await (const chunk of stream) {
        if (clientClosed || res.writableEnded) break;

        const text = chunk.choices[0]?.delta?.content ?? "";
        if (text) {
          writeSse(res, { type: "text", text });
        }
      }

      if (!clientClosed && !res.writableEnded) {
        writeSse(res, { type: "done" });
        res.end();
      }
    } catch (error) {
      console.error("Chat API 错误：", error);

      if (res.headersSent) {
        if (!res.writableEnded) {
          writeSse(res, { type: "error", error: "请求处理失败，请查看 server 终端日志。" });
          res.end();
        }
        return;
      }

      if (!res.writableEnded) {
        res.status(500).json({ error: "请求处理失败，请查看 server 终端日志。" });
      }
    }
  });

  return router;
}
