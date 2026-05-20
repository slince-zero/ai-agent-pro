import { Bot, LoaderCircle, UserRound } from "lucide-react";

import { AssistantHtml } from "@/components/assistant-html";
import { cn } from "@/lib/utils";
import type { Message } from "@/types/chat";

type MessageListProps = {
  messages: Message[];
};

export function MessageList({ messages }: MessageListProps) {
  return (
    <div className="mx-auto w-full max-w-3xl py-6 pb-10">
      {messages.map((message, index) => (
        <MessageItem
          key={`${message.role}-${index}`}
          message={message}
        />
      ))}
    </div>
  );
}

function MessageItem({ message }: { message: Message }) {
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
  );
}
