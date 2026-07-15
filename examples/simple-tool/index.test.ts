import assert from 'node:assert/strict'
import { test } from 'node:test'

import { wordCountTool } from './index.js'

test('counts words and characters', async () => {
  const result = JSON.parse(
    await wordCountTool.run(
      { text: 'build small tools' },
      { signal: new AbortController().signal },
    ),
  ) as { words: number; characters: number }

  assert.deepEqual(result, {
    words: 3,
    characters: 17,
  })
})
