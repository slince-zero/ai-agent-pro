import { Bot, MessageSquareText, Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import type { ChatSession, PromptPreset } from '@/types/chat'

type SidebarProps = {
  activeSessionId: string | null
  isSending: boolean
  isLoadingMessages: boolean
  presets?: PromptPreset[]
  sessions: ChatSession[]
  onNewChat: () => void
  onSelectPrompt?: (prompt: string) => void
  onSelectSession: (sessionId: string) => void
}

export function Sidebar({
  activeSessionId,
  isSending,
  isLoadingMessages,
  sessions,
  onNewChat,
  onSelectSession,
}: SidebarProps) {
  return (
    <aside className="bg-muted/30 hidden h-svh min-w-0 flex-col border-r md:flex">
      <div className="flex h-16 shrink-0 items-center gap-3 px-3">
        <div className="bg-primary text-primary-foreground flex size-9 items-center justify-center rounded-xl shadow-sm">
          <Bot className="size-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">AI Engineering Agent</p>
          <p className="text-muted-foreground text-xs">工程工作台</p>
        </div>
      </div>

      <div className="px-3">
        <Button
          className="h-10 w-full justify-start rounded-xl"
          variant="outline"
          onClick={onNewChat}
          disabled={isSending || isLoadingMessages}
        >
          <Plus className="size-4" aria-hidden="true" />
          新对话
        </Button>
      </div>

      <div className="mt-4 px-3">
        <div className="mb-2 flex items-center justify-between px-1">
          <p className="text-muted-foreground text-xs font-medium">最近会话</p>
          <MessageSquareText className="text-muted-foreground size-3.5" aria-hidden="true" />
        </div>
        <ScrollArea className="h-[30svh] min-h-32">
          <div className="space-y-1 pr-2">
            {sessions.length === 0 ? (
              <p className="text-muted-foreground px-2 py-2 text-xs leading-5">暂无历史会话</p>
            ) : (
              sessions.map((session) => {
                const isActive = session.id === activeSessionId

                return (
                  <Button
                    className={cn(
                      'h-auto w-full justify-start rounded-lg px-2.5 py-2 text-left text-sm font-normal',
                      isActive && 'bg-accent text-accent-foreground',
                    )}
                    key={session.id}
                    variant="ghost"
                    aria-current={isActive ? 'page' : undefined}
                    disabled={isSending || isLoadingMessages}
                    onClick={() => onSelectSession(session.id)}
                  >
                    <MessageSquareText
                      className="text-muted-foreground size-4"
                      aria-hidden="true"
                    />
                    <span className="min-w-0">
                      <span className="block truncate">{session.title}</span>
                      <span className="text-muted-foreground block truncate text-xs">
                        {formatSessionDate(session.updatedAt)}
                      </span>
                    </span>
                  </Button>
                )
              })
            )}
          </div>
        </ScrollArea>
      </div>

      <div className="mt-auto border-t px-3 py-3">
        <div className="bg-background flex items-center justify-between rounded-xl px-3 py-2 text-xs shadow-xs">
          <span className="text-muted-foreground">本地 API</span>
          <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700">
            <span
              className={cn('size-1.5 rounded-full bg-emerald-500', isSending && 'animate-pulse')}
              aria-hidden="true"
            />
            {isSending ? '生成中' : '待命'}
          </span>
        </div>
      </div>
    </aside>
  )
}

function formatSessionDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}
