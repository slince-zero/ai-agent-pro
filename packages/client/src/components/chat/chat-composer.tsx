import { Bot, Network, SendHorizontal, Square } from 'lucide-react'
import type { KeyboardEvent, RefObject } from 'react'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { WorkflowMode } from '@/types/chat'

type ChatComposerProps = {
  canSend: boolean
  input: string
  isSending: boolean
  workflow: WorkflowMode
  textareaRef: RefObject<HTMLTextAreaElement | null>
  onInputChange: (value: string) => void
  onStop: () => void
  onSubmit: () => void
  onWorkflowChange: (workflow: WorkflowMode) => void
}

export function ChatComposer({
  canSend,
  input,
  isSending,
  workflow,
  textareaRef,
  onInputChange,
  onStop,
  onSubmit,
  onWorkflowChange,
}: ChatComposerProps) {
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey) return

    event.preventDefault()
    onSubmit()
  }

  return (
    <form
      className="from-background via-background to-background/70 shrink-0 bg-linear-to-t px-3 pt-3 pb-4 md:px-6 md:pb-6"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
    >
      <div className="bg-card mx-auto w-full max-w-3xl rounded-3xl border p-2 shadow-lg shadow-black/5">
        <div className="flex items-end gap-2">
          <Textarea
            aria-label="Message"
            ref={textareaRef}
            value={input}
            onChange={(event) => onInputChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="发送消息或粘贴 GitHub 仓库链接"
            rows={1}
            className="max-h-45 min-h-10 resize-none border-0 bg-transparent px-3 py-2.5 text-base shadow-none focus-visible:ring-0 md:text-sm"
          />
          <Button
            className="size-10 rounded-full"
            type={isSending ? 'button' : 'submit'}
            size="icon"
            disabled={!isSending && !canSend}
            aria-label={isSending ? '停止生成' : '发送'}
            onClick={isSending ? onStop : undefined}
          >
            {isSending ? (
              <Square className="size-3.5 fill-current" aria-hidden="true" />
            ) : (
              <SendHorizontal className="size-4" aria-hidden="true" />
            )}
          </Button>
        </div>

        <div className="border-border/70 flex items-center justify-between gap-3 border-t px-2 pt-2">
          <span className="text-muted-foreground text-xs">运行方式</span>
          <div className="bg-muted grid grid-cols-2 rounded-md p-0.5" role="radiogroup">
            {[
              { value: 'single' as const, label: '单 Agent', icon: Bot },
              { value: 'multi_agent' as const, label: '多 Agent', icon: Network },
            ].map((option) => {
              const Icon = option.icon
              const selected = workflow === option.value

              return (
                <button
                  aria-checked={selected}
                  className={cn(
                    'flex h-7 items-center justify-center gap-1.5 rounded-sm px-2.5 text-xs transition-colors',
                    selected
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                  disabled={isSending}
                  key={option.value}
                  role="radio"
                  title={
                    option.value === 'single'
                      ? '单次 Agent 工具循环'
                      : 'Planner、Executor、Critic 串行执行，等待最终答案时会显示阶段进度'
                  }
                  type="button"
                  onClick={() => onWorkflowChange(option.value)}
                >
                  <Icon className="size-3.5" aria-hidden="true" />
                  {option.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </form>
  )
}
