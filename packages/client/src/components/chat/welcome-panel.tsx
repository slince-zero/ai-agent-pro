import { Bot } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { PromptPreset } from '@/types/chat'

type WelcomePanelProps = {
  presets: PromptPreset[]
  onSelectPrompt: (prompt: string) => void
}

export function WelcomePanel({ presets, onSelectPrompt }: WelcomePanelProps) {
  return (
    <section className="mx-auto flex min-h-full w-full max-w-3xl flex-col items-center justify-center py-16 text-center">
      <div className="bg-primary text-primary-foreground mb-6 flex size-14 items-center justify-center rounded-2xl shadow-sm">
        <Bot className="size-7" aria-hidden="true" />
      </div>
      <h2 className="text-3xl font-semibold tracking-tight md:text-5xl">
        今天想推进哪个工程任务？
      </h2>
      <p className="text-muted-foreground mt-4 max-w-xl text-sm leading-6 md:text-base">
        从仓库研究、代码理解、Bug 排查到重构规划，把一次工程任务拆成可执行的下一步。
      </p>

      <div className="mt-8 grid w-full gap-2 sm:grid-cols-2">
        {presets.map((preset) => {
          const Icon = preset.icon

          return (
            <Button
              className="bg-card hover:bg-accent h-auto justify-start rounded-2xl border px-4 py-4 text-left shadow-xs"
              key={preset.prompt}
              variant="outline"
              onClick={() => onSelectPrompt(preset.prompt)}
            >
              <Icon className="text-muted-foreground size-4" aria-hidden="true" />
              <span className="min-w-0">
                <span className="block truncate font-medium">{preset.label}</span>
                <span className="text-muted-foreground block truncate text-xs">
                  {preset.prompt}
                </span>
              </span>
            </Button>
          )
        })}
      </div>
    </section>
  )
}
