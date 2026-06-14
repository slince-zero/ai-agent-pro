import type { ServerEvent } from "@/types/chat";

type StreamChatHandlers = {
  onText: (text: string) => void;
  onToolCall?: (toolCallId: string, name: string, args: unknown) => void;
  onToolResult?: (toolCallId: string, name: string, preview: string) => void;
  onUsage?: (inputTokens: number, outputTokens: number, cost: number) => void;
};

type StreamChatOptions = {
  signal?: AbortSignal;
};

export async function streamChatResponse(
  sessionId: string,
  content: string,
  handlers: StreamChatHandlers,
  options: StreamChatOptions = {},
) {
  const response = await fetch(`/api/sessions/${sessionId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content }),
    signal: options.signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `HTTP ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("响应体为空");
  }

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    if (options.signal?.aborted) return;

    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const event of events) {
      if (handleServerEvent(event, handlers)) return;
    }
  }
}

function handleServerEvent(event: string, handlers: StreamChatHandlers) {
  for (const line of event.split("\n")) {
    if (!line.startsWith("data:")) continue;

    const rawData = line.slice(5).trim();
    if (!rawData) continue;

    const data = JSON.parse(rawData) as ServerEvent;

    switch (data.type) {
      case "text":
        handlers.onText(data.text);
        break;
      case "tool_call":
        handlers.onToolCall?.(data.toolCallId, data.name, data.args);
        break;
      case "tool_result":
        handlers.onToolResult?.(data.toolCallId, data.name, data.preview);
        break;
      case "usage":
        handlers.onUsage?.(data.inputTokens, data.outputTokens, data.cost);
        break;
      case "error":
        throw new Error(data.error);
      case "done":
        return true;
    }
  }

  return false;
}
