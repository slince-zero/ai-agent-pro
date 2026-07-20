import type { WorkflowStage } from '@/types/chat'

const runningLabels: Record<WorkflowStage['role'], string> = {
  planner: '正在规划',
  executor: '正在执行',
  critic: '正在审查',
}

const completedLabels: Record<WorkflowStage['role'], string> = {
  planner: '规划完成',
  executor: '执行完成',
  critic: '审查完成',
}

export function getWorkflowStageLabel(stage?: WorkflowStage) {
  if (!stage) return '正在生成'
  if (stage.status === 'running') return runningLabels[stage.role]
  if (stage.status === 'completed') return completedLabels[stage.role]
  if (stage.status === 'failed') return '当前阶段失败'
  return '已停止'
}
