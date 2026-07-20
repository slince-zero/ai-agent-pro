/// <reference types="node" />

import assert from 'node:assert/strict'
import test from 'node:test'

import { handleServerEvent } from './chat-stream'

test('dispatches workflow stage events without treating them as answer text', () => {
  const stages: unknown[] = []
  const text: string[] = []

  const done = handleServerEvent(
    [
      'id: run_1:2',
      'event: workflow_stage',
      'data: {"type":"workflow_stage","role":"planner","sequence":0,"status":"running"}',
    ].join('\n'),
    {
      onText: (value) => text.push(value),
      onWorkflowStage: (stage) => stages.push(stage),
    },
  )

  assert.equal(done, false)
  assert.deepEqual(stages, [{ role: 'planner', sequence: 0, status: 'running' }])
  assert.deepEqual(text, [])
})
