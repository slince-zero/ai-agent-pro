import { useState } from "react";

type Message = {
  role: "user" | "assistant";
  content: string;
};

type ServerEvent =
  | { type: "text"; text: string }
  | { type: "done" }
  | { type: "error"; error: string };

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);

  function updateLastAssistant(content: string) {
    setMessages((prev) => {
      const copy = [...prev];
      const last = copy[copy.length - 1];

      if (!last || last.role !== "assistant") return prev;

      copy[copy.length - 1] = {
        ...last,
        content,
      };

      return copy;
    });
  }

  function appendLastAssistant(text: string) {
    setMessages((prev) => {
      const copy = [...prev];
      const last = copy[copy.length - 1];

      if (!last || last.role !== "assistant") return prev;

      copy[copy.length - 1] = {
        ...last,
        content: last.content + text,
      };

      return copy;
    });
  }

  async function sendMessage() {
    const content = input.trim();
    if (!content || isSending) return;

    const nextMessages: Message[] = [
      ...messages,
      { role: "user", content },
    ];

    setMessages([...nextMessages, { role: "assistant", content: "" }]);
    setInput("");
    setIsSending(true);

    try {
      const response = await fetch("http://localhost:3001/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ messages: nextMessages }),
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
          for (const line of event.split("\n")) {
            if (!line.startsWith("data:")) continue;

            const rawData = line.slice(5).trim();
            if (!rawData) continue;

            const data = JSON.parse(rawData) as ServerEvent;

            if (data.type === "text") {
              appendLastAssistant(data.text);
            }

            if (data.type === "error") {
              throw new Error(data.error);
            }

            if (data.type === "done") {
              return;
            }
          }
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "请求失败";
      updateLastAssistant(`请求失败：${message}`);
    } finally {
      setIsSending(false);
    }
  }

  return (
    <main style={{ maxWidth: 800, margin: "40px auto", fontFamily: "sans-serif" }}>
      <h1>AI Project Agent</h1>

      <div>
        {messages.map((message, index) => (
          <div key={index} style={{ marginBottom: 16 }}>
            <strong>{message.role}:</strong>
            <pre style={{ whiteSpace: "pre-wrap" }}>{message.content}</pre>
          </div>
        ))}
      </div>

      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        rows={4}
        style={{ width: "100%" }}
      />

      <button onClick={sendMessage} disabled={!input.trim() || isSending}>
        {isSending ? "Sending..." : "Send"}
      </button>
    </main>
  );
}
