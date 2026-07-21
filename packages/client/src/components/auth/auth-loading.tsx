import { LoaderCircle } from 'lucide-react'

export function AuthLoading() {
  return (
    <main className="bg-background text-foreground flex min-h-svh items-center justify-center">
      <div className="flex items-center gap-3" role="status">
        <span className="bg-primary flex size-9 items-center justify-center rounded-lg font-mono text-sm font-semibold text-white">
          AI
        </span>
        <span className="text-sm font-semibold">AI Engineering Agent</span>
        <LoaderCircle className="text-muted-foreground size-4 animate-spin" aria-hidden="true" />
        <span className="sr-only">正在恢复会话</span>
      </div>
    </main>
  )
}
