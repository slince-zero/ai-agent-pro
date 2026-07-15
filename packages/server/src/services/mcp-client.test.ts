import assert from 'node:assert/strict'
import test from 'node:test'

import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js'

import {
  createMcpModelToolName,
  discoverMcpTools,
  parseMcpServersConfig,
  type McpConnectedServer,
  type McpServerConfig,
} from './mcp-client.js'

const baseConfig: McpServerConfig = {
  name: 'Example Server',
  command: 'node',
  args: ['server.js'],
  cwd: undefined,
  env: {},
  timeoutMs: 10_000,
  disabled: false,
}

function createTool(overrides: Partial<Tool> = {}): Tool {
  return {
    name: 'search.files',
    description: 'Search files',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
        },
      },
      required: ['query'],
    },
    annotations: {
      readOnlyHint: true,
    },
    ...overrides,
  }
}

test('parses Claude-style MCP server config', () => {
  const configs = parseMcpServersConfig(
    JSON.stringify({
      mcpServers: {
        filesystem: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
          env: {
            TOKEN: 'local-token',
          },
          timeoutMs: 12_000,
        },
        disabled_tool: {
          command: 'node',
          disabled: true,
        },
      },
    }),
  )

  assert.deepEqual(configs, [
    {
      name: 'filesystem',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
      env: {
        TOKEN: 'local-token',
      },
      timeoutMs: 12_000,
      disabled: false,
    },
  ])
})

test('parses array MCP server config', () => {
  const configs = parseMcpServersConfig(
    JSON.stringify([
      {
        name: 'github',
        command: 'node',
        args: ['github-mcp.js'],
      },
    ]),
  )

  assert.equal(configs[0]?.name, 'github')
  assert.equal(configs[0]?.command, 'node')
  assert.deepEqual(configs[0]?.args, ['github-mcp.js'])
})

test('rejects malformed MCP server config', () => {
  assert.throws(() => parseMcpServersConfig('{bad json'), /not valid JSON/)
  assert.throws(
    () =>
      parseMcpServersConfig(
        JSON.stringify({
          mcpServers: {
            missing_command: {},
          },
        }),
      ),
    /MCP_SERVERS_JSON is invalid/,
  )
})

test('creates namespaced model-safe MCP tool names', () => {
  assert.equal(
    createMcpModelToolName('Example Server', 'search.files'),
    'mcp_example_server_search_files',
  )

  const longName = createMcpModelToolName('server'.repeat(20), 'tool'.repeat(20))
  assert.equal(longName.length <= 64, true)
  assert.match(longName, /^mcp_/)
})

test('discovers MCP tools and adapts them to AppTool definitions', async () => {
  const calls: { toolName: string; args: Record<string, unknown> }[] = []
  const connectServer = async (config: McpServerConfig): Promise<McpConnectedServer> => ({
    config: {
      ...config,
      env: {
        TOKEN: 'local-token',
      },
    },
    async listTools(cursor) {
      if (!cursor) {
        return { tools: [], nextCursor: 'next' }
      }
      return { tools: [createTool()], nextCursor: undefined }
    },
    async callTool(toolName, args) {
      calls.push({ toolName, args })
      return {
        content: [
          {
            type: 'text',
            text: `result for ${String(args.query)}`,
          },
        ],
      }
    },
    close: async () => {},
  })

  const tools = await discoverMcpTools({
    configs: [baseConfig],
    connectServer,
  })

  assert.equal(tools.length, 1)
  assert.equal(tools[0]?.name, 'mcp_example_server_search_files')
  assert.deepEqual(tools[0]?.governance, {
    category: 'system',
    sideEffect: false,
    requiresAuth: true,
    timeoutMs: 10_000,
  })
  assert.deepEqual(tools[0]?.parameters.required, ['query'])

  const result = await tools[0]?.run({ query: 'README' })
  assert.equal(result, 'result for README')
  assert.deepEqual(calls, [
    {
      toolName: 'search.files',
      args: {
        query: 'README',
      },
    },
  ])
})

test('throws when an MCP tool returns isError', async () => {
  const connectServer = async (config: McpServerConfig): Promise<McpConnectedServer> => ({
    config,
    async listTools() {
      return { tools: [createTool({ name: 'dangerous' })] }
    },
    async callTool(): Promise<CallToolResult> {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: 'permission denied',
          },
        ],
      }
    },
    close: async () => {},
  })

  const [tool] = await discoverMcpTools({
    configs: [baseConfig],
    connectServer,
  })

  await assert.rejects(() => tool?.run({}), /permission denied/)
})
