import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  Bot,
  Code2,
  GitBranch,
  LoaderCircle,
  MessageSquareText,
  Plus,
  Search,
  SendHorizontal,
  Sparkles,
  SquarePen,
  UserRound,
  Wrench,
} from "lucide-react";

import { AssistantHtml } from "@/components/assistant-html";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Message = {
  role: "user" | "assistant";
  content: string;
};

type ServerEvent =
  | { type: "text"; text: string }
  | { type: "done" }
  | { type: "error"; error: string };

const promptPresets = [
  {
    label: "读取 GitHub 仓库",
    prompt: "https://github.com/facebook/react",
    icon: GitBranch,
  },
  {
    label: "检查组件结构",
    prompt: "帮我检查 React 组件结构",
    icon: Code2,
  },
  {
    label: "优化交互细节",
    prompt: "优化这个页面的交互细节",
    icon: Wrench,
  },
  {
    label: "分析报错日志",
    prompt: "分析接口报错日志",
    icon: Search,
  },
  {
    label: "制定重构方案",
    prompt: "给我一个重构方案",
    icon: Sparkles,
  },
];

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
    debugger;
    const content = input.trim();
    if (!content || isSending) return;

    const nextMessages: Message[] = [...messages, { role: "user", content }];

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

  function startNewChat() {
    if (isSending) return;

    setMessages([]);
    setInput("");
    textareaRef.current?.focus();
  }

  function fillSuggestedPrompt(prompt: string) {
    setInput(prompt);
    textareaRef.current?.focus();
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) return;

    event.preventDefault();
    void sendMessage();
  }

  return (
    <main className="grid h-svh overflow-hidden bg-background text-foreground md:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="hidden h-svh min-w-0 flex-col border-r bg-muted/30 md:flex">
        <div className="flex h-16 shrink-0 items-center gap-3 px-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Bot className="size-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">AI Project Agent</p>
            <p className="text-xs text-muted-foreground">前端工作区</p>
          </div>
        </div>

        <div className="px-3">
          <Button
            className="h-10 w-full justify-start rounded-xl"
            variant="outline"
            onClick={startNewChat}
            disabled={isSending}
          >
            <Plus className="size-4" aria-hidden="true" />
            新对话
          </Button>
        </div>

        <div className="mt-5 px-3">
          <div className="mb-2 flex items-center justify-between px-1">
            <p className="text-xs font-medium text-muted-foreground">快捷提示</p>
            <MessageSquareText
              className="size-3.5 text-muted-foreground"
              aria-hidden="true"
            />
          </div>
          <ScrollArea className="h-[calc(100svh-14rem)]">
            <div className="space-y-1 pr-2">
              {promptPresets.map((preset) => {
                const Icon = preset.icon;

                return (
                  <Button
                    className="h-auto w-full justify-start rounded-lg px-2.5 py-2 text-left text-sm font-normal"
                    key={preset.prompt}
                    variant="ghost"
                    onClick={() => fillSuggestedPrompt(preset.prompt)}
                  >
                    <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
                    <span className="truncate">{preset.label}</span>
                  </Button>
                );
              })}
            </div>
          </ScrollArea>
        </div>

        <div className="mt-auto border-t px-3 py-3">
          <div className="flex items-center justify-between rounded-xl bg-background px-3 py-2 text-xs shadow-xs">
            <span className="text-muted-foreground">本地 API</span>
            <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700">
              <span
                className={cn(
                  "size-1.5 rounded-full bg-emerald-500",
                  isSending && "animate-pulse",
                )}
                aria-hidden="true"
              />
              {isSending ? "生成中" : "待命"}
            </span>
          </div>
        </div>
      </aside>

      <section className="grid h-svh min-w-0 grid-rows-[auto_minmax(0,1fr)_auto]">
        <header className="flex h-16 shrink-0 items-center justify-between border-b bg-background/90 px-4 backdrop-blur md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">
                AI Project Agent
              </p>
              <h1 className="truncate text-base font-semibold">项目助手</h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge className="hidden rounded-full px-3 py-1 md:inline-flex" variant="secondary">
              DeepSeek
            </Badge>
            <Button
              className="rounded-full"
              size="sm"
              variant="outline"
              onClick={startNewChat}
              disabled={isSending}
            >
              <SquarePen className="size-4" aria-hidden="true" />
              新建
            </Button>
          </div>
        </header>

        <div
          className="min-h-0 overflow-y-auto overscroll-contain px-4 [scrollbar-gutter:stable] md:px-6"
          ref={scrollRef}
        >
          {!hasMessages ? (
            <section className="mx-auto flex min-h-full w-full max-w-3xl flex-col items-center justify-center py-16 text-center">
              <div className="mb-6 flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
                <Bot className="size-7" aria-hidden="true" />
              </div>
              <h2 className="text-3xl font-semibold tracking-tight md:text-5xl">
                今天想构建什么？
              </h2>
              <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground md:text-base">
                项目分析、界面优化、Bug 定位和重构规划都可以从这里开始。
              </p>

              <div className="mt-8 grid w-full gap-2 sm:grid-cols-2">
                {promptPresets.map((preset) => {
                  const Icon = preset.icon;

                  return (
                    <Button
                      className="h-auto justify-start rounded-2xl border bg-card px-4 py-4 text-left shadow-xs hover:bg-accent"
                      key={preset.prompt}
                      variant="outline"
                      onClick={() => fillSuggestedPrompt(preset.prompt)}
                    >
                      <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">
                          {preset.label}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {preset.prompt}
                        </span>
                      </span>
                    </Button>
                  );
                })}
              </div>
            </section>
          ) : (
            <div className="mx-auto w-full max-w-3xl py-6 pb-10">
              {messages.map((message, index) => (
                <article
                  className={cn(
                    "flex gap-3 py-5",
                    message.role === "user" && "justify-end",
                  )}
                  key={`${message.role}-${index}`}
                >
                  {message.role === "assistant" && (
                    <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Bot className="size-4" aria-hidden="true" />
                    </div>
                  )}

                  <div
                    className={cn(
                      "min-w-0 max-w-[min(44rem,100%)]",
                      message.role === "user" && "flex flex-col items-end",
                    )}
                  >
                    <p className="mb-2 text-xs font-medium text-muted-foreground">
                      {message.role === "assistant" ? "AI Project Agent" : "你"}
                    </p>
                    <div
                      className={cn(
                        "text-sm leading-7 text-foreground wrap-anywhere md:text-[15px]",
                        message.role === "user" &&
                          "whitespace-pre-wrap rounded-3xl bg-muted px-4 py-2.5",
                      )}
                    >
                      {message.content ? (
                        message.role === "assistant" ? (
                          <AssistantHtml html={message.content} />
                        ) : (
                          message.content
                        )
                      ) : (
                        <span className="inline-flex items-center gap-1.5 py-1">
                          <LoaderCircle
                            className="size-4 animate-spin text-muted-foreground"
                            aria-hidden="true"
                          />
                          <span className="text-muted-foreground">正在生成</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {message.role === "user" && (
                    <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
                      <UserRound className="size-4" aria-hidden="true" />
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>

        <form
          className="shrink-0 bg-linear-to-t from-background via-background to-background/70 px-3 pb-4 pt-3 md:px-6 md:pb-6"
          onSubmit={(event) => {
            event.preventDefault();
            void sendMessage();
          }}
        >
          <div className="mx-auto flex w-full max-w-3xl items-end gap-2 rounded-3xl border bg-card p-2 shadow-lg shadow-black/5">
            <Textarea
              aria-label="Message"
              ref={textareaRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              placeholder="发送消息或粘贴 GitHub 仓库链接"
              rows={1}
              className="max-h-45 min-h-10 resize-none border-0 bg-transparent px-3 py-2.5 text-base shadow-none focus-visible:ring-0 md:text-sm"
            />
            <Button
              className="size-10 rounded-full"
              type="submit"
              size="icon"
              disabled={!canSend}
              aria-label={isSending ? "发送中" : "发送"}
            >
              {isSending ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <SendHorizontal className="size-4" aria-hidden="true" />
              )}
            </Button>
          </div>
        </form>
      </section>
    </main>
  );
}
