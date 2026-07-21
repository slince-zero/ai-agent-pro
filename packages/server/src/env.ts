import { z } from 'zod'

const booleanEnv = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true')

const envSchema = z
  .object({
    // ---- 必填 ----
    OPENAI_API_KEY: z
      .string()
      .trim()
      .min(1, 'OPENAI_API_KEY 不能为空，请在 .env 中设置有效的 API Key'),
    DATABASE_URL: z
      .string()
      .trim()
      .min(1, 'DATABASE_URL 不能为空，请在 .env 中设置数据库连接字符串'),

    // ---- 可选（有默认值） ----
    MODEL_PROVIDER: z.enum(['openai-compatible', 'anthropic']).default('openai-compatible'),
    DEEPSEEK_BASE_URL: z.string().trim().min(1).default('https://api.deepseek.com'),
    DEEPSEEK_MODEL: z.string().trim().min(1).default('deepseek-v4-pro'),
    EMBEDDING_MODEL: z.string().trim().min(1).default('text-embedding-3-small'),
    PORT: z.coerce.number().int().positive().default(3003),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    CODE_SANDBOX_ENABLED: booleanEnv,
    CODE_SANDBOX_DOCKER_BINARY: z.string().trim().min(1).default('docker'),
    CODE_SANDBOX_JAVASCRIPT_IMAGE: z.string().trim().min(1).default('node:22-alpine'),
    CODE_SANDBOX_PYTHON_IMAGE: z.string().trim().min(1).default('python:3.13-alpine'),

    // ---- 可选（无默认值） ----
    MODEL_BASE_URL: z.string().trim().min(1).optional(),
    MODEL_NAME: z.string().trim().min(1).optional(),
    EMBEDDING_API_KEY: z.string().trim().min(1).optional(),
    EMBEDDING_BASE_URL: z.string().trim().min(1).optional(),
    GITHUB_TOKEN: z.string().trim().optional(),
    MCP_SERVERS_JSON: z.string().trim().optional(),
    CLIENT_DIST_DIR: z.string().trim().optional(),
    BETTER_AUTH_SECRET: z
      .string()
      .trim()
      .min(32, 'BETTER_AUTH_SECRET 至少需要 32 个字符')
      .optional(),
    BETTER_AUTH_URL: z.url('BETTER_AUTH_URL 必须是有效的 URL').optional(),
    AUTH_TRUSTED_ORIGINS: z.string().trim().optional(),
  })
  .superRefine((value, context) => {
    if (value.NODE_ENV !== 'production') return

    if (!value.BETTER_AUTH_SECRET) {
      context.addIssue({
        code: 'custom',
        path: ['BETTER_AUTH_SECRET'],
        message: '生产环境必须设置 BETTER_AUTH_SECRET',
      })
    }

    if (!value.BETTER_AUTH_URL) {
      context.addIssue({
        code: 'custom',
        path: ['BETTER_AUTH_URL'],
        message: '生产环境必须设置 BETTER_AUTH_URL',
      })
    }
  })

export type Env = z.infer<typeof envSchema>

function prepareEnv(source: NodeJS.ProcessEnv): Record<string, string | undefined> {
  const result: Record<string, string | undefined> = {}
  for (const [key, value] of Object.entries(source)) {
    // 将空字符串视为未设置，让 schema 的 default / required 校验生效
    result[key] = value === '' ? undefined : value
  }
  return result
}

export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(prepareEnv(source))

  if (result.success) {
    return result.data
  }

  const lines = result.error.issues.map((issue) => {
    const path = issue.path.join('.')
    return `  • ${path}: ${issue.message}`
  })

  const message = [
    '❌ 环境变量配置错误，请检查以下变量：',
    ...lines,
    '',
    '请参考 server/.env.example 配置正确的环境变量。',
  ].join('\n')

  throw new Error(message)
}

export const env = parseEnv()
