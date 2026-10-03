import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadSuite, suites } from './dataset.js'
import type { SuiteName } from './dataset.js'

/*
 * 评测本身不进 CI（要花钱、结果有波动），但用例文件进：
 * 写错一个字段名，期望就会被 strictObject 拒掉，而不是悄悄变成"不检查"。
 */
for (const name of Object.keys(suites) as SuiteName[]) {
  test(`the ${name} suite parses and has unique ids`, async () => {
    const cases = await loadSuite(name)

    assert.ok(cases.length > 0)
  })
}
