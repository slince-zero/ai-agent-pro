import "dotenv/config";
import express, { type Response } from "express";
import cors from "cors";
import OpenAI from "openai";
import type { ChatCompletionCreateParamsStreaming } from "openai/resources/chat/completions";

const app = express();
const model = process.env.DEEPSEEK_MODEL || "deepseek-v4-pro";

type ClientMessage = {
  role: "user" | "assistant";
  content: string;
};

type ServerEvent =
  | { type: "text"; text: string }
  | { type: "done" }
  | { type: "error"; error: string };

function isClientMessage(message: unknown): message is ClientMessage {
  if (!message || typeof message !== "object") return false;

  const candidate = message as Partial<ClientMessage>;
  return (
    (candidate.role === "user" || candidate.role === "assistant") &&
    typeof candidate.content === "string"
  );
}

function writeSse(res: Response, event: ServerEvent) {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

// 1. 安全 CORS
app.use(cors({
  origin: process.env.NODE_ENV === "production" ? false : true
}));

app.use(express.json());

// 2. 校验 API Key
if (!process.env.OPENAI_API_KEY) {
  throw new Error("缺少 OPENAI_API_KEY 环境变量");
}

// 3. DeepSeek 必须配置 baseURL
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
});

app.post("/api/chat", async (req, res) => {
  try {
    const { messages } = req.body;

    // 4. 参数校验
    if (!Array.isArray(messages) || !messages.every(isClientMessage)) {
      return res.status(400).json({ error: "messages 必须是 user/assistant 消息数组" });
    }

    // SSE 响应头
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    let clientClosed = false;
    res.on("close", () => {
      clientClosed = true;
    });

    const streamParams: ChatCompletionCreateParamsStreaming & {
      thinking: { type: "disabled" };
    } = {
      model,
      stream: true,
      messages: [
        {
          role: "system",
          content: "你是一个前端项目分析助手，擅长分析 React/Vite/TypeScript 项目。"
        },
        ...messages
      ],
      // DeepSeek V4 默认是 thinking mode；禁用后前端能更快收到可展示的 content。
      thinking: { type: "disabled" },
    };
    const stream = await openai.chat.completions.create(streamParams);

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
    // 6. 全局错误捕获（最重要）
    console.error("Chat API 错误：", error);

    if (res.headersSent) {
      if (!res.writableEnded) {
        writeSse(res, { type: "error", error: "模型接口请求失败，请查看 server 终端日志。" });
        res.end();
      }
      return;
    }

    if (!res.writableEnded) {
      res.status(500).json({ error: "模型接口请求失败，请查看 server 终端日志。" });
    }
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
