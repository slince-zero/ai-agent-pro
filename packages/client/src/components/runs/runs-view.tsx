import {
  AlertCircle,
  BrainCircuit,
  CheckCircle2,
  Clock3,
  LoaderCircle,
  RefreshCw,
  Wrench,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { fetchRunTrace, fetchRuns } from '@/lib/runs'
import { cn } from '@/lib/utils'
import type { RunStatus, RunTrace } from '@/types/runs'

export function RunsView() {
  const [runs, setRuns] = useState<RunTrace[]>([])
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [selectedRun, setSelectedRun] = useState<RunTrace | null>(null)
  const [isLoadingRuns, setIsLoadingRuns] = useState(true)
  const [isLoadingTrace, setIsLoadingTrace] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadRuns = useCallback(async () => {
    setIsLoadingRuns(true)
    setError(null)

    try {
      const nextRuns = await fetchRuns()
      setRuns(nextRuns)
      setSelectedRunId((current) => current ?? nextRuns[0]?.id ?? null)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '加载运行记录失败')
    } finally {
      setIsLoadingRuns(false)
    }
  }, [])

  useEffect(() => {
    void loadRuns()
  }, [loadRuns])

  useEffect(() => {
    if (!selectedRunId) {
      setSelectedRun(null)
      return
    }

    let ignore = false
    setIsLoadingTrace(true)
    setError(null)

    async function loadTrace() {
      try {
        const trace = await fetchRunTrace(selectedRunId!)
        if (!ignore) setSelectedRun(trace)
      } catch (loadError) {
        if (!ignore) {
          setError(loadError instanceof Error ? loadError.message : '加载运行详情失败')
        }
      } finally {
        if (!ignore) setIsLoadingTrace(false)
      }
    }

    void loadTrace()

    return () => {
      ignore = true
    }
  }, [selectedRunId])

  const activeRun = selectedRun ?? runs.find((run) => run.id === selectedRunId) ?? null

  return (
    <div className="mx-auto grid min-h-full w-full max-w-6xl gap-4 py-5 lg:grid-cols-[320px_minmax(0,1fr)]">
      <section className="min-h-0 border-b pb-4 lg:border-r lg:border-b-0 lg:pr-4 lg:pb-0">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">运行记录</h2>
            <p className="text-muted-foreground text-xs">最近 AgentRun 和工具调用</p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void loadRuns()}
            disabled={isLoadingRuns}
          >
            <RefreshCw className={cn('size-4', isLoadingRuns && 'animate-spin')} />
            刷新
          </Button>
        </div>

        {isLoadingRuns ? (
          <LoadingLabel label="正在加载 runs" />
        ) : runs.length === 0 ? (
          <p className="text-muted-foreground rounded-lg border px-3 py-6 text-center text-sm">
            暂无运行记录
          </p>
        ) : (
          <div className="space-y-2">
            {runs.map((run) => (
              <RunListItem
                isActive={run.id === activeRun?.id}
                key={run.id}
                run={run}
                onSelect={() => setSelectedRunId(run.id)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="min-w-0">
        {error && (
          <div className="border-destructive/30 bg-destructive/5 text-destructive mb-3 rounded-lg border px-3 py-2 text-sm">
            {error}
          </div>
        )}

        {isLoadingTrace && !selectedRun ? (
          <LoadingLabel label="正在加载 trace" />
        ) : activeRun ? (
          <RunDetail run={activeRun} isLoadingTrace={isLoadingTrace} />
        ) : (
          <p className="text-muted-foreground rounded-lg border px-3 py-10 text-center text-sm">
            选择一条运行记录查看详情
          </p>
        )}
      </section>
    </div>
  )
}

function RunListItem({
  isActive,
  run,
  onSelect,
}: {
  isActive: boolean
  run: RunTrace
  onSelect: () => void
}) {
  return (
    <button
      className={cn(
        'w-full rounded-lg border px-3 py-3 text-left transition-colors hover:bg-accent',
        isActive && 'border-primary bg-accent',
      )}
      type="button"
      onClick={onSelect}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <StatusBadge status={run.status} />
        <span className="text-muted-foreground shrink-0 text-xs">{formatDate(run.startedAt)}</span>
      </div>
      <p className="truncate text-sm font-medium">{run.session.title}</p>
      <p className="text-muted-foreground mt-1 line-clamp-2 text-xs leading-5">
        {run.userMessage?.preview ?? run.userMessage?.content ?? '无用户消息'}
      </p>
      <div className="text-muted-foreground mt-2 flex items-center gap-3 text-xs">
        <span>{run.model}</span>
        <span>{formatWorkflow(run.workflow)}</span>
        <span>{run.toolCalls.length} tools</span>
      </div>
    </button>
  )
}

function RunDetail({ isLoadingTrace, run }: { isLoadingTrace: boolean; run: RunTrace }) {
  const duration = useMemo(() => formatDuration(run.startedAt, run.finishedAt), [run])

  return (
    <div className="space-y-4">
      <div className="rounded-lg border px-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2">
              <StatusBadge status={run.status} />
              {isLoadingTrace && (
                <LoaderCircle className="text-muted-foreground size-4 animate-spin" />
              )}
            </div>
            <h2 className="truncate text-lg font-semibold">{run.session.title}</h2>
            <p className="text-muted-foreground mt-1 font-mono text-xs">{run.id}</p>
          </div>
          <div className="text-muted-foreground text-right text-xs leading-5">
            <p>{formatDate(run.startedAt)}</p>
            <p>{duration}</p>
          </div>
        </div>

        <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="模型" value={run.model} />
          <Metric label="工作流" value={formatWorkflow(run.workflow)} />
          <Metric label="Tokens" value={formatTokens(run.inputTokens, run.outputTokens)} />
          <Metric label="Cost" value={run.cost == null ? '-' : `$${run.cost.toFixed(6)}`} />
        </div>

        {run.error && (
          <div className="border-destructive/30 bg-destructive/5 text-destructive mt-3 rounded-md border px-3 py-2 text-sm">
            {run.error}
          </div>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <MessagePanel title="User Message" value={run.userMessage?.content} />
        <MessagePanel title="Assistant Message" value={run.assistantMessage?.content} />
      </div>

      {run.stages.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <BrainCircuit className="text-muted-foreground size-4" aria-hidden="true" />
            <h3 className="text-sm font-semibold">工作流阶段</h3>
          </div>
          {run.stages.map((stage) => (
            <StagePanel key={stage.id} stage={stage} />
          ))}
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Wrench className="text-muted-foreground size-4" aria-hidden="true" />
          <h3 className="text-sm font-semibold">工具调用</h3>
        </div>
        {run.toolCalls.length === 0 ? (
          <p className="text-muted-foreground rounded-lg border px-3 py-6 text-center text-sm">
            本次运行没有工具调用
          </p>
        ) : (
          run.toolCalls.map((toolCall) => <ToolCallPanel key={toolCall.id} toolCall={toolCall} />)
        )}
      </div>
    </div>
  )
}

function StagePanel({ stage }: { stage: RunTrace['stages'][number] }) {
  return (
    <div className="rounded-lg border px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <StatusIcon status={stage.status} />
          <span className="text-sm font-medium">{formatStageRole(stage.role)}</span>
        </div>
        <div className="text-muted-foreground flex items-center gap-3 text-xs">
          <span>{formatTokens(stage.inputTokens, stage.outputTokens)}</span>
          <span>{formatDuration(stage.startedAt, stage.finishedAt)}</span>
        </div>
      </div>
      {stage.output && <TraceBlock label="Output" value={stage.output} />}
      {stage.error && (
        <div className="border-destructive/30 bg-destructive/5 text-destructive mt-3 rounded-md border px-3 py-2 text-sm">
          {stage.error}
        </div>
      )}
    </div>
  )
}

function ToolCallPanel({ toolCall }: { toolCall: RunTrace['toolCalls'][number] }) {
  return (
    <div className="rounded-lg border px-4 py-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <StatusIcon status={toolCall.status as RunStatus} />
          <span className="truncate text-sm font-medium">{toolCall.name}</span>
        </div>
        <span className="text-muted-foreground text-xs">
          {formatDuration(toolCall.startedAt, toolCall.finishedAt)}
        </span>
      </div>

      {toolCall.arguments !== undefined && (
        <TraceBlock label="Arguments" value={formatJson(toolCall.arguments)} />
      )}
      {toolCall.resultPreview && (
        <TraceBlock label="Result preview" value={toolCall.resultPreview} />
      )}
      {toolCall.error && (
        <div className="border-destructive/30 bg-destructive/5 text-destructive mt-3 rounded-md border px-3 py-2 text-sm">
          {toolCall.error}
        </div>
      )}
    </div>
  )
}

function MessagePanel({ title, value }: { title: string; value?: string | null }) {
  return (
    <div className="rounded-lg border px-4 py-3">
      <h3 className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
        {title}
      </h3>
      <p className="max-h-52 overflow-auto text-sm leading-6 whitespace-pre-wrap">
        {value?.trim() ? value : '无内容'}
      </p>
    </div>
  )
}

function TraceBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-3">
      <p className="text-muted-foreground mb-1 text-xs font-medium">{label}</p>
      <pre className="bg-muted/50 max-h-56 overflow-auto rounded-md px-3 py-2 text-xs leading-5 whitespace-pre-wrap">
        {value}
      </pre>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/40 rounded-md px-3 py-2">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-1 truncate text-sm font-medium">{value}</p>
    </div>
  )
}

function StatusBadge({ status }: { status: RunStatus }) {
  return (
    <Badge
      className="gap-1 rounded-full"
      variant={status === 'failed' ? 'destructive' : 'secondary'}
    >
      <StatusIcon status={status} />
      {getStatusLabel(status)}
    </Badge>
  )
}

function StatusIcon({ status }: { status: RunStatus }) {
  if (status === 'running') return <LoaderCircle className="size-3.5 animate-spin" />
  if (status === 'completed') return <CheckCircle2 className="size-3.5" />
  if (status === 'failed') return <AlertCircle className="size-3.5" />
  return <Clock3 className="size-3.5" />
}

function LoadingLabel({ label }: { label: string }) {
  return (
    <div className="text-muted-foreground flex items-center justify-center gap-2 rounded-lg border px-3 py-8 text-sm">
      <LoaderCircle className="size-4 animate-spin" />
      {label}
    </div>
  )
}

function getStatusLabel(status: RunStatus) {
  if (status === 'completed') return 'completed'
  if (status === 'failed') return 'failed'
  if (status === 'canceled') return 'canceled'
  return 'running'
}

function formatWorkflow(workflow: RunTrace['workflow']) {
  return workflow === 'multi_agent' ? 'Multi-Agent' : 'Single Agent'
}

function formatStageRole(role: RunTrace['stages'][number]['role']) {
  if (role === 'planner') return 'Planner'
  if (role === 'executor') return 'Executor'
  return 'Critic'
}

function formatJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return '无法展示参数'
  }
}

function formatTokens(inputTokens: number | null, outputTokens: number | null) {
  if (inputTokens == null || outputTokens == null) return '-'
  return `${inputTokens.toLocaleString()} in / ${outputTokens.toLocaleString()} out`
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatDuration(startedAt: string, finishedAt: string | null) {
  if (!finishedAt) return '进行中'

  const ms = new Date(finishedAt).getTime() - new Date(startedAt).getTime()
  if (!Number.isFinite(ms) || ms < 0) return '-'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}
