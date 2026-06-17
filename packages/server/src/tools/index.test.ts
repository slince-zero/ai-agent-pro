import assert from 'node:assert/strict'
import { afterEach, mock, test } from 'node:test'

process.env.OPENAI_API_KEY = 'test-api-key'
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test'

afterEach(() => {
  mock.restoreAll()
})

test('returns OpenAI-compatible tool definitions', async () => {
  const { getOpenAITools } = await import('./index.js')

  const tools = getOpenAITools()
  const toolNames = tools.flatMap((tool) => ('function' in tool ? [tool.function.name] : []))

  assert.ok(toolNames.includes('github_repository_lookup'))
  assert.ok(toolNames.includes('web_fetch'))
  assert.equal(
    tools.every((tool) => tool.type === 'function'),
    true,
  )
})

test('returns a friendly message for unknown tools', async () => {
  const { runTool } = await import('./index.js')

  const result = await runTool('missing_tool', {})

  assert.equal(result, '未知工具：missing_tool')
})

test('returns validation details for invalid tool arguments', async () => {
  const { runTool } = await import('./index.js')

  const result = JSON.parse(await runTool('web_fetch', {})) as {
    error: string
    tool: string
    issues: { path: string; message: string }[]
  }

  assert.equal(result.error, '工具参数校验失败')
  assert.equal(result.tool, 'web_fetch')
  assert.equal(result.issues[0]?.path, 'url')
})

test('runs registered tools with parsed arguments', async () => {
  mock.method(
    globalThis,
    'fetch',
    async () =>
      new Response(
        JSON.stringify({
          full_name: 'openai/openai',
          html_url: 'https://github.com/openai/openai',
          description: 'OpenAI public repo',
          stargazers_count: 42,
          forks_count: 7,
          open_issues_count: 3,
          language: 'TypeScript',
          default_branch: 'main',
          license: { spdx_id: 'MIT' },
          updated_at: '2026-01-01T00:00:00Z',
          pushed_at: '2026-01-02T00:00:00Z',
          topics: ['ai'],
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        },
      ),
  )

  const { runTool } = await import('./index.js')
  const result = JSON.parse(
    await runTool('github_repository_lookup', { owner: 'openai', repo: 'openai' }),
  ) as {
    full_name: string
    stars: number
    topics: string[]
  }

  assert.equal(result.full_name, 'openai/openai')
  assert.equal(result.stars, 42)
  assert.deepEqual(result.topics, ['ai'])
})

test('surfaces tool-level network errors as tool results', async () => {
  mock.method(globalThis, 'fetch', async () => {
    throw new Error('network unavailable')
  })

  const { runTool } = await import('./index.js')
  const result = JSON.parse(
    await runTool('github_repository_lookup', { owner: 'openai', repo: 'openai' }),
  ) as {
    error: string
  }

  assert.match(result.error, /network unavailable/)
})
