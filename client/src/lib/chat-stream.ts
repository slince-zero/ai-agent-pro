import type { Message, ServerEvent } from "@/types/chat";

type StreamChatHandlers = {
  onText: (text: string) => void;
};

export async function streamChatResponse(
  messages: Message[],
  { onText }: StreamChatHandlers,
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
      if (handleServerEvent(event, onText)) return;
    }
  }
}

function handleServerEvent(event: string, onText: (text: string) => void) {
  for (const line of event.split("\n")) {
    if (!line.startsWith("data:")) continue;

    const rawData = line.slice(5).trim();
    if (!rawData) continue;

    const data = JSON.parse(rawData) as ServerEvent;

    if (data.type === "text") {
      onText(data.text);
    }

    if (data.type === "error") {
      throw new Error(data.error);
    }

    if (data.type === "done") {
      return true;
    }
  }

  return false;
}
