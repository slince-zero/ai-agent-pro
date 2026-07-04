import { Bot, CheckCircle2, ExternalLink, FileText, LoaderCircle, UserRound } from 'lucide-react'

import { AssistantHtml } from '@/components/assistant-html'
import { cn } from '@/lib/utils'
import type { Citation, Message, ToolEvent } from '@/types/chat'

type MessageListProps = {
  messages: Message[]
  isSending: boolean
}

export function MessageList({ messages, isSending }: MessageListProps) {
  return (
    <div className="mx-auto w-full max-w-3xl py-6 pb-10">
      {messages.map((message, index) => {
        const isStreaming =
          isSending && index === messages.length - 1 && message.role === 'assistant'

        return (
          <MessageItem
            key={message.id ?? `${message.role}-${index}`}
            isStreaming={isStreaming}
            message={message}
          />
        )
      })}
    </div>
  )
}

function MessageItem({ isStreaming, message }: { isStreaming: boolean; message: Message }) {
  const toolEvents = message.role === 'assistant' ? (message.toolEvents ?? []) : []
  const citations = message.role === 'assistant' ? (message.citations ?? []) : []

  return (
    <article className={cn('flex gap-3 py-5', message.role === 'user' && 'justify-end')}>
      {message.role === 'assistant' && (
        <div className="bg-primary text-primary-foreground mt-1 flex size-8 shrink-0 items-center justify-center rounded-full">
          <Bot className="size-4" aria-hidden="true" />
        </div>
      )}

      <div
        className={cn(
          'min-w-0 max-w-[min(44rem,100%)]',
          message.role === 'user' && 'flex flex-col items-end',
        )}
      >
        <p className="text-muted-foreground mb-2 text-xs font-medium">
          {message.role === 'assistant' ? 'AI Engineering Agent' : '你'}
        </p>
        <div
          className={cn(
            'text-sm leading-7 text-foreground wrap-anywhere md:text-[15px]',
            message.role === 'user' && 'whitespace-pre-wrap rounded-sm bg-muted px-2 py-1.5',
          )}
        >
          {message.role === 'assistant' ? (
            <div className="space-y-3">
              {toolEvents.length > 0 && <ToolEventList events={toolEvents} />}
              {message.content ? (
                <AssistantHtml html={message.content} isStreaming={isStreaming} />
              ) : (
                <span className="inline-flex items-center gap-1.5 py-1">
                  <LoaderCircle
                    className="text-muted-foreground size-4 animate-spin"
                    aria-hidden="true"
                  />
                  <span className="text-muted-foreground">正在生成</span>
                </span>
              )}
              {citations.length > 0 && <CitationList citations={citations} />}
              {message.usage && <UsageSummary usage={message.usage} />}
            </div>
          ) : message.content ? (
            message.content
          ) : (
            <span className="inline-flex items-center gap-1.5 py-1">
              <LoaderCircle
                className="text-muted-foreground size-4 animate-spin"
                aria-hidden="true"
              />
              <span className="text-muted-foreground">正在生成</span>
            </span>
          )}
        </div>
      </div>

      {message.role === 'user' && (
        <div className="bg-foreground text-background mt-1 flex size-8 shrink-0 items-center justify-center rounded-full">
          <UserRound className="size-4" aria-hidden="true" />
        </div>
      )}
    </article>
  )
}

function CitationList({ citations }: { citations: Citation[] }) {
  return (
    <div className="space-y-2 pt-1">
      <div className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
        <FileText className="size-3.5" aria-hidden="true" />
        <span>引用</span>
      </div>
      <div className="grid gap-2">
        {citations.map((citation, index) => (
          <CitationBubble
            citation={citation}
            index={index}
            key={citation.id || `${citation.title}-${index}`}
          />
        ))}
      </div>
    </div>
  )
}

function CitationBubble({ citation, index }: { citation: Citation; index: number }) {
  const location = citation.sourceRef || citation.uri
  const className =
    'border-border/70 bg-background hover:bg-muted/45 block rounded-md border px-3 py-2 text-left text-xs leading-5 transition-colors'
  const content = (
    <>
      <div className="flex min-w-0 items-start gap-2">
        <span className="bg-primary/10 text-primary mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold">
          {index + 1}
        </span>
        <span className="min-w-0 flex-1">
          <span className="text-foreground flex min-w-0 items-center gap-1.5 font-medium">
            <span className="truncate">{citation.title}</span>
            {citation.uri && (
              <ExternalLink className="text-muted-foreground size-3 shrink-0" aria-hidden="true" />
            )}
          </span>
          {location && (
            <span className="text-muted-foreground block truncate text-[11px]">{location}</span>
          )}
        </span>
      </div>
      <p className="text-muted-foreground mt-1.5 line-clamp-2 wrap-anywhere">{citation.snippet}</p>
    </>
  )

  return citation.uri ? (
    <a className={className} href={citation.uri} rel="noreferrer" target="_blank">
      {content}
    </a>
  ) : (
    <div className={className}>{content}</div>
  )
}

function ToolEventList({ events }: { events: ToolEvent[] }) {
  return (
    <div className="space-y-2">
      {events.map((event) => (
        <ToolEventCard key={event.id} event={event} />
      ))}
    </div>
  )
}

function ToolEventCard({ event }: { event: ToolEvent }) {
  const isRunning = event.status === 'running'

  return (
    <div className="border-border/70 bg-muted/35 text-muted-foreground rounded-2xl border px-3.5 py-3 text-xs leading-5">
      <div className="text-foreground flex items-center gap-2 font-medium">
        {isRunning ? (
          <LoaderCircle
            className="text-muted-foreground size-3.5 animate-spin"
            aria-hidden="true"
          />
        ) : (
          <CheckCircle2 className="text-muted-foreground size-3.5" aria-hidden="true" />
        )}
        <span>{isRunning ? `正在调用 ${event.name}` : getDoneLabel(event)}</span>
      </div>

      {event.args !== undefined && (
        <pre className="bg-background/70 text-muted-foreground mt-2 max-h-24 overflow-hidden rounded-xl px-3 py-2 font-mono text-[11px] leading-5 wrap-break-word whitespace-pre-wrap">
          {formatPreview(event.args)}
        </pre>
      )}

      {event.preview && (
        <p className="mt-2 line-clamp-3 wrap-break-word whitespace-pre-wrap">{event.preview}</p>
      )}
    </div>
  )
}

function getDoneLabel(event: ToolEvent) {
  if (event.name === 'github_repository_lookup') {
    return '已获取仓库信息'
  }

  if (event.name === 'web_fetch') {
    return '已读取网页内容'
  }

  return `已完成 ${event.name}`
}

function formatPreview(value: unknown) {
  try {
    const preview = typeof value === 'string' ? value : JSON.stringify(value, null, 2)

    if (!preview) return '无参数'
    return preview.length > 240 ? `${preview.slice(0, 240)}...` : preview
  } catch {
    return '参数无法预览'
  }
}

function UsageSummary({ usage }: { usage: NonNullable<Message['usage']> }) {
  return (
    <div className="text-muted-foreground flex items-center gap-2 text-xs">
      <span>
        {usage.inputTokens.toLocaleString()} input + {usage.outputTokens.toLocaleString()} output
        tokens
      </span>
      <span aria-hidden="true" className="select-none">
        ·
      </span>
      <span>${usage.cost.toFixed(6)}</span>
    </div>
  )
}
