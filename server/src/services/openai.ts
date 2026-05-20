import OpenAI from "openai";

export const MODEL = process.env.DEEPSEEK_MODEL || "deepseek-v4-pro";

export function createOpenAIClient() {
  return process.env.OPENAI_API_KEY
    ? new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
      })
    : null;
}
