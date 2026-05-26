import { Bot, CheckCircle2, LoaderCircle, UserRound } from "lucide-react";

import { AssistantHtml } from "@/components/assistant-html";
import { cn } from "@/lib/utils";
import type { Message, ToolEvent } from "@/types/chat";

type MessageListProps = {
  messages: Message[];
};

export function MessageList({ messages }: MessageListProps) {
  return (
    <div className="mx-auto w-full max-w-3xl py-6 pb-10">
      {messages.map((message, index) => (
        <MessageItem
          key={message.id ?? `${message.role}-${index}`}
          message={message}
        />
      ))}
    </div>
  );
}

function MessageItem({ message }: { message: Message }) {
  const toolEvents =
    message.role === "assistant" ? (message.toolEvents ?? []) : [];

  return (
    <article
      className={cn(
        "flex gap-3 py-5",
        message.role === "user" && "justify-end",
      )}
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
          {message.role === "assistant" ? "AI Engineering Agent" : "你"}
        </p>
        <div
          className={cn(
            "text-sm leading-7 text-foreground wrap-anywhere md:text-[15px]",
            message.role === "user" &&
              "whitespace-pre-wrap rounded-sm bg-muted px-2 py-1.5",
          )}
        >
          {message.role === "assistant" ? (
            <div className="space-y-3">
              {toolEvents.length > 0 && <ToolEventList events={toolEvents} />}
              {message.content ? (
                <AssistantHtml html={message.content} />
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
          ) : message.content ? (
            message.content
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
  );
}

function ToolEventList({ events }: { events: ToolEvent[] }) {
  return (
    <div className="space-y-2">
      {events.map((event) => (
        <ToolEventCard key={event.id} event={event} />
      ))}
    </div>
  );
}

function ToolEventCard({ event }: { event: ToolEvent }) {
  const isRunning = event.status === "running";

  return (
    <div className="rounded-2xl border border-border/70 bg-muted/35 px-3.5 py-3 text-xs leading-5 text-muted-foreground">
      <div className="flex items-center gap-2 font-medium text-foreground">
        {isRunning ? (
          <LoaderCircle
            className="size-3.5 animate-spin text-muted-foreground"
            aria-hidden="true"
          />
        ) : (
          <CheckCircle2
            className="size-3.5 text-muted-foreground"
            aria-hidden="true"
          />
        )}
        <span>{isRunning ? `正在调用 ${event.name}` : getDoneLabel(event)}</span>
      </div>

      {event.args !== undefined && (
        <pre className="mt-2 max-h-24 overflow-hidden whitespace-pre-wrap wrap-break-word rounded-xl bg-background/70 px-3 py-2 font-mono text-[11px] leading-5 text-muted-foreground">
          {formatPreview(event.args)}
        </pre>
      )}

      {event.preview && (
        <p className="mt-2 line-clamp-3 whitespace-pre-wrap wrap-break-word">
          {event.preview}
        </p>
      )}
    </div>
  );
}

function getDoneLabel(event: ToolEvent) {
  if (event.name === "github_repository_lookup") {
    return "已获取仓库信息";
  }

  if (event.name === "web_fetch") {
    return "已读取网页内容";
  }

  return `已完成 ${event.name}`;
}

function formatPreview(value: unknown) {
  try {
    const preview =
      typeof value === "string" ? value : JSON.stringify(value, null, 2);

    if (!preview) return "无参数";
    return preview.length > 240 ? `${preview.slice(0, 240)}...` : preview;
  } catch {
    return "参数无法预览";
  }
}
