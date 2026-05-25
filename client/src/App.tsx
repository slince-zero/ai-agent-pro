import { useCallback, useEffect, useRef, useState } from "react";

import { ChatComposer } from "@/components/chat/chat-composer";
import { ChatHeader } from "@/components/chat/chat-header";
import { MessageList } from "@/components/chat/message-list";
import { Sidebar } from "@/components/chat/sidebar";
import { WelcomePanel } from "@/components/chat/welcome-panel";
import { streamChatResponse } from "@/lib/chat-stream";
import { promptPresets } from "@/lib/prompt-presets";
import type { Message } from "@/types/chat";

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const toolEventCounterRef = useRef(0);

  const hasMessages = messages.length > 0;
  const canSend = input.trim().length > 0 && !isSending;

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "auto",
    });
  }, [messages, isSending]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`;
  }, [input]);

  const updateLastAssistant = useCallback((content: string) => {
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
  }, []);

  const appendLastAssistant = useCallback((text: string) => {
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
  }, []);

  const appendToolCall = useCallback((name: string, args: unknown) => {
    toolEventCounterRef.current += 1;
    const id = `${name}-${toolEventCounterRef.current}`;

    setMessages((prev) => {
      const copy = [...prev];
      const last = copy[copy.length - 1];

      if (!last || last.role !== "assistant") return prev;

      copy[copy.length - 1] = {
        ...last,
        toolEvents: [
          ...(last.toolEvents ?? []),
          {
            id,
            name,
            args,
            status: "running",
          },
        ],
      };

      return copy;
    });
  }, []);

  const completeToolCall = useCallback((name: string, preview: string) => {
    toolEventCounterRef.current += 1;
    const fallbackId = `${name}-${toolEventCounterRef.current}`;

    setMessages((prev) => {
      const copy = [...prev];
      const last = copy[copy.length - 1];

      if (!last || last.role !== "assistant") return prev;

      const toolEvents = [...(last.toolEvents ?? [])];
      const matchingIndex = toolEvents.findLastIndex(
        (event) => event.name === name && event.status === "running",
      );

      if (matchingIndex >= 0) {
        toolEvents[matchingIndex] = {
          ...toolEvents[matchingIndex],
          status: "done",
          preview,
        };
      } else {
        toolEvents.push({
          id: fallbackId,
          name,
          status: "done",
          preview,
        });
      }

      copy[copy.length - 1] = {
        ...last,
        toolEvents,
      };

      return copy;
    });
  }, []);

  const sendMessage = useCallback(async () => {
    const content = input.trim();
    if (!content || isSending) return;

    const nextMessages: Message[] = [...messages, { role: "user", content }];

    setMessages([...nextMessages, { role: "assistant", content: "" }]);
    setInput("");
    setIsSending(true);

    try {
      await streamChatResponse(nextMessages, {
        onText: appendLastAssistant,
        onToolCall: appendToolCall,
        onToolResult: completeToolCall,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "请求失败";
      updateLastAssistant(`请求失败：${message}`);
    } finally {
      setIsSending(false);
    }
  }, [
    appendLastAssistant,
    appendToolCall,
    completeToolCall,
    input,
    isSending,
    messages,
    updateLastAssistant,
  ]);

  const startNewChat = useCallback(() => {
    if (isSending) return;

    setMessages([]);
    setInput("");
    textareaRef.current?.focus();
  }, [isSending]);

  const fillSuggestedPrompt = useCallback((prompt: string) => {
    setInput(prompt);
    textareaRef.current?.focus();
  }, []);

  return (
    <main className="grid h-svh overflow-hidden bg-background text-foreground md:grid-cols-[260px_minmax(0,1fr)]">
      <Sidebar
        isSending={isSending}
        presets={promptPresets}
        onNewChat={startNewChat}
        onSelectPrompt={fillSuggestedPrompt}
      />

      <section className="grid h-svh min-w-0 grid-rows-[auto_minmax(0,1fr)_auto]">
        <ChatHeader isSending={isSending} onNewChat={startNewChat} />

        <div
          className="min-h-0 overflow-y-auto overscroll-contain px-4 scrollbar-gutter-stable md:px-6"
          ref={scrollRef}
        >
          {!hasMessages ? (
            <WelcomePanel
              presets={promptPresets}
              onSelectPrompt={fillSuggestedPrompt}
            />
          ) : (
            <MessageList messages={messages} />
          )}
        </div>

        <ChatComposer
          canSend={canSend}
          input={input}
          isSending={isSending}
          textareaRef={textareaRef}
          onInputChange={setInput}
          onSubmit={() => void sendMessage()}
        />
      </section>
    </main>
  );
}
