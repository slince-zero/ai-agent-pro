import { Activity, Bot, MessageSquareText, Pencil, Plus, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import type { ChatSession, PromptPreset } from '@/types/chat'

type SidebarProps = {
  activeSessionId: string | null
  activeView: 'chat' | 'runs'
  isSending: boolean
  isLoadingMessages: boolean
  presets?: PromptPreset[]
  sessions: ChatSession[]
  onNewChat: () => void
  onDeleteSession: (sessionId: string) => void
  onRenameSession: (session: ChatSession) => void
  onSelectRuns: () => void
  onSelectPrompt?: (prompt: string) => void
  onSelectSession: (sessionId: string) => void
}

export function Sidebar({
  activeSessionId,
  activeView,
  isSending,
  isLoadingMessages,
  sessions,
  onNewChat,
  onDeleteSession,
  onRenameSession,
  onSelectRuns,
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

      <div className="space-y-2 px-3">
        <Button
          className="h-10 w-full justify-start rounded-xl"
          variant="outline"
          onClick={onNewChat}
          disabled={isSending || isLoadingMessages}
        >
          <Plus className="size-4" aria-hidden="true" />
          新对话
        </Button>
        <Button
          className={cn(
            'h-10 w-full justify-start rounded-xl',
            activeView === 'runs' && 'bg-accent text-accent-foreground',
          )}
          variant="ghost"
          onClick={onSelectRuns}
          disabled={isSending}
        >
          <Activity className="size-4" aria-hidden="true" />
          Runs
        </Button>
      </div>

      <div className="mt-4 px-3">
        <div className="mb-2 flex items-center justify-between px-1">
          <p className="text-muted-foreground text-xs font-medium">最近会话</p>
          <MessageSquareText className="text-muted-foreground size-3.5" aria-hidden="true" />
        </div>
        <ScrollArea className="h-full">
          <div className="space-y-1 pr-2">
            {sessions.length === 0 ? (
              <p className="text-muted-foreground px-2 py-2 text-xs leading-5">暂无历史会话</p>
            ) : (
              sessions.map((session) => {
                const isActive = session.id === activeSessionId

                return (
                  <div
                    className={cn(
                      'group/session flex min-w-0 items-center gap-1 rounded-lg',
                      isActive && 'bg-accent text-accent-foreground',
                    )}
                    key={session.id}
                  >
                    <Button
                      className="h-auto min-w-0 flex-1 justify-start rounded-lg px-2.5 py-2 text-left text-sm font-normal"
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
                    <div className="flex shrink-0 pr-1 opacity-0 transition-opacity group-hover/session:opacity-100 focus-within:opacity-100">
                      <Button
                        className="size-7 rounded-md"
                        size="icon"
                        title="重命名"
                        type="button"
                        variant="ghost"
                        disabled={isSending || isLoadingMessages}
                        onClick={() => onRenameSession(session)}
                      >
                        <Pencil className="size-3.5" aria-hidden="true" />
                        <span className="sr-only">重命名</span>
                      </Button>
                      <Button
                        className="text-destructive hover:text-destructive size-7 rounded-md"
                        size="icon"
                        title="删除"
                        type="button"
                        variant="ghost"
                        disabled={isSending || isLoadingMessages}
                        onClick={() => onDeleteSession(session.id)}
                      >
                        <Trash2 className="size-3.5" aria-hidden="true" />
                        <span className="sr-only">删除</span>
                      </Button>
                    </div>
                  </div>
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
