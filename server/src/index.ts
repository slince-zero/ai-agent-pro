import "dotenv/config";
import express, { type Response } from "express";
import cors from "cors";
import OpenAI from "openai";
import type { ChatCompletionCreateParamsStreaming } from "openai/resources/chat/completions";
import { findToolForInput } from "./tools/index.js";

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

function getLatestUserInput(messages: ClientMessage[]) {
  return [...messages].reverse().find((message) => message.role === "user")?.content ?? "";
}

function getSystemPrompt() {
  return [
    "你是一个前端项目分析助手，擅长分析 React/Vite/TypeScript 项目。",
    "输出格式要求：",
    "1. 回答正文必须是可直接嵌入页面的安全、语义化 HTML 片段，不要输出 Markdown，也不要使用 ```html 代码围栏。",
    "2. 只使用这些标签：p、h2、h3、h4、ul、ol、li、strong、em、code、pre、table、thead、tbody、tr、th、td、blockquote、hr、a、br、kbd。",
    "3. 不要输出 script、style、svg、iframe、form、input、button、img 标签，不要输出 style/class/id 属性或任何 on* 事件属性。",
    "4. 代码示例使用 <pre><code>...</code></pre>，代码里的 < 和 > 必须分别写成 &lt; 和 &gt;。",
    "5. 优先把结论放在开头；需要步骤、风险、对比时使用列表或表格。"
  ].join("\n");
}

app.use(
  cors({
    origin: process.env.NODE_ENV === "production" ? false : true,
  }),
);

app.use(express.json());

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
    })
  : null;

app.post("/api/chat", async (req, res) => {
  try {
    const { messages } = req.body;

    // 4. 参数校验
    if (!Array.isArray(messages) || !messages.every(isClientMessage)) {
      return res.status(400).json({ error: "messages 必须是 user/assistant 消息数组" });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

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

    const streamParams: ChatCompletionCreateParamsStreaming & {
      thinking: { type: "disabled" };
    } = {
      model,
      stream: true,
      messages: [
        {
          role: "system",
          content: getSystemPrompt(),
        },
        ...messages,
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

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
