/// <reference types="node" />

import assert from 'node:assert/strict'
import test from 'node:test'

import { getWorkflowStageLabel } from './workflow-stage'

test('maps workflow stages to concise progress labels', () => {
  assert.equal(getWorkflowStageLabel(), '正在生成')
  assert.equal(
    getWorkflowStageLabel({ role: 'planner', sequence: 0, status: 'running' }),
    '正在规划',
  )
  assert.equal(
    getWorkflowStageLabel({ role: 'executor', sequence: 1, status: 'completed' }),
    '执行完成',
  )
  assert.equal(
    getWorkflowStageLabel({ role: 'critic', sequence: 2, status: 'failed' }),
    '当前阶段失败',
  )
  assert.equal(getWorkflowStageLabel({ role: 'critic', sequence: 2, status: 'canceled' }), '已停止')
})
