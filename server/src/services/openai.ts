import OpenAI from "openai";
import type { ChatCompletionCreateParamsStreaming } from "openai/resources/chat/completions";
import { getSystemPrompt } from "../prompts/system.js";
import type { ClientMessage } from "../types/chat.js";

const model = process.env.DEEPSEEK_MODEL || "deepseek-v4-pro";

export function createOpenAIClient() {
  return process.env.OPENAI_API_KEY
    ? new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
      })
    : null;
}

export async function createChatCompletionStream(openai: OpenAI, messages: ClientMessage[]) {
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

  return openai.chat.completions.create(streamParams);
}
