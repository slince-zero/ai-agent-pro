import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'

type EvalSuite = {
  fixture: string
  cases: {
    id: string
    question: string
    expectedFacts: string[]
    expectedSources: string[]
  }[]
}

function parseSource(source: string) {
  const match = /^(?<file>.+)#L(?<start>\d+)-L(?<end>\d+)$/.exec(source)
  assert.ok(match?.groups, `Invalid source reference: ${source}`)

  return {
    file: match.groups.file!,
    start: Number(match.groups.start),
    end: Number(match.groups.end),
  }
}

test('repository QA cases point to existing fixture lines', async () => {
  const root = process.cwd()
  const suite = JSON.parse(
    await readFile(path.join(root, 'evals/repository-qa.json'), 'utf8'),
  ) as EvalSuite

  assert.ok(suite.cases.length >= 8)
  assert.equal(new Set(suite.cases.map((item) => item.id)).size, suite.cases.length)

  for (const item of suite.cases) {
    assert.ok(item.question.trim(), `${item.id} has no question`)
    assert.ok(item.expectedFacts.length > 0, `${item.id} has no expected facts`)
    assert.ok(item.expectedSources.length > 0, `${item.id} has no expected sources`)

    for (const source of item.expectedSources) {
      const reference = parseSource(source)
      const content = await readFile(path.join(root, suite.fixture, reference.file), 'utf8')
      const lineCount = content.split('\n').length

      assert.ok(reference.start >= 1, `${source} starts before line 1`)
      assert.ok(reference.end >= reference.start, `${source} has a reversed range`)
      assert.ok(reference.end <= lineCount, `${source} exceeds ${reference.file}`)
    }
  }
})
