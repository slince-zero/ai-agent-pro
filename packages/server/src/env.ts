import { z } from 'zod'

const envSchema = z.object({
  // ---- 必填 ----
  OPENAI_API_KEY: z
    .string()
    .trim()
    .min(1, 'OPENAI_API_KEY 不能为空，请在 .env 中设置有效的 API Key'),
  DATABASE_URL: z.string().trim().min(1, 'DATABASE_URL 不能为空，请在 .env 中设置数据库连接字符串'),

  // ---- 可选（有默认值） ----
  MODEL_PROVIDER: z.enum(['openai-compatible', 'anthropic']).default('openai-compatible'),
  DEEPSEEK_BASE_URL: z.string().trim().min(1).default('https://api.deepseek.com'),
  DEEPSEEK_MODEL: z.string().trim().min(1).default('deepseek-v4-pro'),
  PORT: z.coerce.number().int().positive().default(3003),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DEFAULT_USER_EMAIL: z.string().trim().min(1).default('local@ai-pro-agent.dev'),

  // ---- 可选（无默认值） ----
  MODEL_BASE_URL: z.string().trim().min(1).optional(),
  MODEL_NAME: z.string().trim().min(1).optional(),
  GITHUB_TOKEN: z.string().trim().optional(),
  CLIENT_DIST_DIR: z.string().trim().optional(),
})

export type Env = z.infer<typeof envSchema>

function prepareEnv(): Record<string, string | undefined> {
  const result: Record<string, string | undefined> = {}
  for (const [key, value] of Object.entries(process.env)) {
    // 将空字符串视为未设置，让 schema 的 default / required 校验生效
    result[key] = value === '' ? undefined : value
  }
  return result
}

function parseEnv(): Env {
  const result = envSchema.safeParse(prepareEnv())

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
