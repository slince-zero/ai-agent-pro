import { Bot, GitBranch, LoaderCircle } from 'lucide-react'
import { type FormEvent, useState } from 'react'

import { Button } from '@/components/ui/button'
import type { PromptPreset } from '@/types/chat'

type WelcomePanelProps = {
  activeRepository?: string
  presets: PromptPreset[]
  onImportRepository: (url: string) => Promise<void>
  onSelectPrompt: (prompt: string) => void
}

export function WelcomePanel({
  activeRepository,
  presets,
  onImportRepository,
  onSelectPrompt,
}: WelcomePanelProps) {
  const [repositoryUrl, setRepositoryUrl] = useState('')
  const [isImporting, setIsImporting] = useState(false)
  const [error, setError] = useState('')

  async function submitRepository(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const url = repositoryUrl.trim()
    if (!url || isImporting) return

    setError('')
    setIsImporting(true)
    try {
      await onImportRepository(url)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '仓库导入失败')
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <section className="mx-auto flex min-h-full w-full max-w-3xl flex-col items-center justify-center py-16 text-center">
      <div className="bg-primary text-primary-foreground mb-6 flex size-14 items-center justify-center rounded-2xl shadow-sm">
        <Bot className="size-7" aria-hidden="true" />
      </div>
      <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">读懂一个 GitHub 仓库</h2>
      <p className="text-muted-foreground mt-4 max-w-xl text-sm leading-6 md:text-base">
        导入公开仓库，基于真实源码解释项目架构、调用链和实现细节。
      </p>

      {activeRepository ? (
        <div className="bg-muted/50 mt-8 flex w-full items-center gap-3 border-y px-4 py-3 text-left">
          <GitBranch className="text-muted-foreground size-5 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-muted-foreground text-xs">当前仓库</p>
            <p className="truncate text-sm font-medium">{activeRepository}</p>
          </div>
        </div>
      ) : (
        <form className="mt-8 w-full text-left" onSubmit={submitRepository}>
          <label className="text-sm font-medium" htmlFor="repository-url">
            GitHub 仓库地址
          </label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <div className="relative min-w-0 flex-1">
              <GitBranch
                className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
                aria-hidden="true"
              />
              <input
                className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-10 w-full rounded-md border pr-3 pl-9 text-sm outline-none focus-visible:ring-[3px]"
                id="repository-url"
                inputMode="url"
                placeholder="https://github.com/owner/repository"
                type="url"
                value={repositoryUrl}
                onChange={(event) => setRepositoryUrl(event.target.value)}
                disabled={isImporting}
                required
              />
            </div>
            <Button className="h-10 rounded-md" type="submit" disabled={isImporting}>
              {isImporting ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <GitBranch className="size-4" aria-hidden="true" />
              )}
              {isImporting ? '正在索引' : '导入仓库'}
            </Button>
          </div>
          {error && <p className="text-destructive mt-2 text-sm">{error}</p>}
        </form>
      )}

      {activeRepository && (
        <div className="mt-8 grid w-full gap-2 sm:grid-cols-2">
          {presets.map((preset) => {
            const Icon = preset.icon

            return (
              <Button
                className="bg-card hover:bg-accent min-h-20 items-start justify-start rounded-md border px-4 py-4 text-left shadow-xs"
                key={preset.prompt}
                variant="outline"
                onClick={() => onSelectPrompt(preset.prompt)}
              >
                <Icon className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block font-medium">{preset.label}</span>
                  <span className="text-muted-foreground line-clamp-2 block text-xs leading-5 break-words whitespace-normal">
                    {preset.prompt}
                  </span>
                </span>
              </Button>
            )
          })}
        </div>
      )}
    </section>
  )
}
