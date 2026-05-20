import type OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
} from "openai/resources/chat/completions";
import { getSystemPrompt } from "../prompts/system.js";
import { getOpenAITools, toolDispatch } from "../tools/index.js";
import type { ClientMessage } from "../types/chat.js";
import { MODEL } from "./openai.js";

const MAX_ITERATIONS = 6;

export type AgentEvent =
  | { type: "text"; text: string }
  | { type: "tool_call"; name: string; args: unknown }
  | { type: "tool_result"; name: string; preview: string }
  | { type: "error"; error: string };

type RunAgentOptions = {
  openai: OpenAI;
  messages: ClientMessage[];
  onEvent: (event: AgentEvent) => void;
  signal: { aborted: boolean };
};

type ToolCallAccumulator = {
  id: string;
  name: string;
  arguments: string;
};

export async function runAgent({
  openai,
  messages,
  onEvent,
  signal,
}: RunAgentOptions) {
  const conversation: ChatCompletionMessageParam[] = [
    { role: "system", content: getSystemPrompt() },
    ...messages.map<ChatCompletionMessageParam>((m) =>
      m.role === "user"
        ? { role: "user", content: m.content }
        : { role: "assistant", content: m.content },
    ),
  ];

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    if (signal.aborted) return;

    const stream = await openai.chat.completions.create({
      model: MODEL,
      stream: true,
      messages: conversation,
      tools: getOpenAITools(),
      tool_choice: "auto",
      // DeepSeek V4 扩展参数：禁用 thinking 模式以便前端尽快收到内容。
      ...({ thinking: { type: "disabled" } } as Record<string, unknown>),
    });

    let textBuffer = "";
    const toolCalls = new Map<number, ToolCallAccumulator>();
    let finishReason: string | null = null;

    for await (const chunk of stream) {
      if (signal.aborted) return;

      const choice = chunk.choices[0];
      if (!choice) continue;

      const delta = choice.delta;

      if (delta?.content) {
        textBuffer += delta.content;
        onEvent({ type: "text", text: delta.content });
      }

      if (delta?.tool_calls) {
        for (const part of delta.tool_calls) {
          const index = part.index;
          const existing =
            toolCalls.get(index) ?? { id: "", name: "", arguments: "" };
          if (part.id) existing.id = part.id;
          if (part.function?.name) existing.name = part.function.name;
          if (part.function?.arguments)
            existing.arguments += part.function.arguments;
          toolCalls.set(index, existing);
        }
      }

      if (choice.finish_reason) finishReason = choice.finish_reason;
    }

    if (finishReason !== "tool_calls" || toolCalls.size === 0) {
      return;
    }

    const orderedCalls = [...toolCalls.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, value]) => value);

    const assistantToolCalls: ChatCompletionMessageToolCall[] =
      orderedCalls.map((call) => ({
        id: call.id,
        type: "function",
        function: {
          name: call.name,
          arguments: call.arguments || "{}",
        },
      }));

    conversation.push({
      role: "assistant",
      content: textBuffer || null,
      tool_calls: assistantToolCalls,
    });

    for (const call of orderedCalls) {
      if (signal.aborted) return;

      let parsedArgs: Record<string, unknown> = {};
      try {
        parsedArgs = call.arguments ? JSON.parse(call.arguments) : {};
      } catch (error) {
        const message = `工具参数解析失败：${(error as Error).message}`;
        conversation.push({
          role: "tool",
          tool_call_id: call.id,
          content: message,
        });
        onEvent({
          type: "tool_result",
          name: call.name,
          preview: message.slice(0, 120),
        });
        continue;
      }

      onEvent({ type: "tool_call", name: call.name, args: parsedArgs });

      const tool = toolDispatch[call.name];
      let resultText: string;
      if (!tool) {
        resultText = `未知工具：${call.name}`;
      } else {
        try {
          resultText = await tool.run(parsedArgs as never);
        } catch (error) {
          console.error(`工具 ${call.name} 执行失败：`, error);
          resultText = `工具执行出错：${(error as Error).message}`;
        }
      }

      conversation.push({
        role: "tool",
        tool_call_id: call.id,
        content: resultText,
      });
      onEvent({
        type: "tool_result",
        name: call.name,
        preview: resultText.slice(0, 120),
      });
    }
  }

  onEvent({
    type: "error",
    error: `Agent 工具迭代次数超过上限（${MAX_ITERATIONS}）`,
  });
}
