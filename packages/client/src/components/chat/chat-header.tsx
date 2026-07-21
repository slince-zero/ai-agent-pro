import { Activity, MessageSquareText, SquarePen } from 'lucide-react'

import { AccountMenu } from '@/components/auth/account-menu'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { AuthUser } from '@/lib/auth'

type ChatHeaderProps = {
  activeSessionTitle?: string
  activeView: 'chat' | 'runs'
  isSending: boolean
  user: AuthUser
  onNewChat: () => void
  onSelectChat: () => void
  onSelectRuns: () => void
  onSignOut: () => Promise<void>
}

export function ChatHeader({
  activeSessionTitle,
  activeView,
  isSending,
  user,
  onNewChat,
  onSelectChat,
  onSelectRuns,
  onSignOut,
}: ChatHeaderProps) {
  return (
    <header className="bg-background/90 flex h-16 shrink-0 items-center justify-between border-b px-3 backdrop-blur sm:px-4 md:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <span className="bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-lg font-mono text-xs font-semibold sm:hidden">
          AI
        </span>
        <div className="hidden min-w-0 sm:block">
          <p className="text-muted-foreground text-xs font-medium">AI Engineering Agent</p>
          <h1 className="truncate text-base font-semibold">
            {activeView === 'runs' ? 'Runs Trace' : (activeSessionTitle ?? '工程 Agent 工作台')}
          </h1>
        </div>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2">
        <Badge className="hidden rounded-full px-3 py-1 md:inline-flex" variant="secondary">
          DeepSeek
        </Badge>
        <Button
          className="rounded-full"
          size="sm"
          variant={activeView === 'runs' ? 'default' : 'outline'}
          onClick={activeView === 'runs' ? onSelectChat : onSelectRuns}
          disabled={isSending && activeView !== 'runs'}
        >
          {activeView === 'runs' ? (
            <MessageSquareText className="size-4" aria-hidden="true" />
          ) : (
            <Activity className="size-4" aria-hidden="true" />
          )}
          <span className="hidden min-[420px]:inline">
            {activeView === 'runs' ? '对话' : 'Runs'}
          </span>
        </Button>
        <Button
          className="rounded-full"
          size="sm"
          variant="outline"
          onClick={onNewChat}
          disabled={isSending}
        >
          <SquarePen className="size-4" aria-hidden="true" />
          <span className="hidden min-[420px]:inline">新建</span>
        </Button>
        <div className="md:hidden">
          <AccountMenu compact onSignOut={onSignOut} user={user} />
        </div>
      </div>
    </header>
  )
}
