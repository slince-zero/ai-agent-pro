import type { Message, ServerEvent } from "@/types/chat";

type StreamChatHandlers = {
  onText: (text: string) => void;
  onToolCall?: (name: string, args: unknown) => void;
  onToolResult?: (name: string, preview: string) => void;
};

export async function streamChatResponse(
  messages: Message[],
  handlers: StreamChatHandlers,
) {
  const response = await fetch("http://localhost:3003/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messages }),
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
        handlers.onToolCall?.(data.name, data.args);
        break;
      case "tool_result":
        handlers.onToolResult?.(data.name, data.preview);
        break;
      case "error":
        throw new Error(data.error);
      case "done":
        return true;
    }
  }

  return false;
}
