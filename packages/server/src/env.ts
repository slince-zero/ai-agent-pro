import { z } from 'zod'

export const DEVELOPMENT_AUTH_SECRET = 'ai-agent-pro-development-only-auth-secret'

const unsafeTrustProxyValues = new Set(['true', '*', '0', '0.0.0.0/0', '::/0'])

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
    API_MAX_BODY_BYTES: z.coerce.number().int().min(1_024).max(1_048_576).default(65_536),
    API_MAX_URL_CHARS: z.coerce.number().int().min(512).max(16_384).default(4_096),
    API_RATE_LIMIT_WINDOW_MS: z.coerce
      .number()
      .int()
      .min(1_000)
      .default(15 * 60 * 1_000),
    API_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(60),
    RUN_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
    RUN_CONCURRENCY_MAX: z.coerce.number().int().min(1).max(10).default(2),

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
    AUTH_APP_URL: z.url('AUTH_APP_URL 必须是有效的 URL').optional(),
    AUTH_EMAIL_PROVIDER: z.enum(['console', 'resend']).default('console'),
    AUTH_EMAIL_FROM: z.string().trim().min(1).optional(),
    RESEND_API_KEY: z.string().trim().min(1).optional(),
    TRUST_PROXY: z
      .string()
      .trim()
      .min(1)
      .refine((value) => {
        const normalized = value.toLowerCase()
        if (unsafeTrustProxyValues.has(normalized)) return false
        if (/^\d+$/.test(normalized)) return Number(normalized) >= 1 && Number(normalized) <= 10
        return true
      }, 'TRUST_PROXY 不能信任任意来源，跳数必须在 1 到 10 之间')
      .optional(),
  })
  .superRefine((value, context) => {
    if (value.NODE_ENV !== 'production') return

    if (!value.BETTER_AUTH_SECRET) {
      context.addIssue({
        code: 'custom',
        path: ['BETTER_AUTH_SECRET'],
        message: '生产环境必须设置 BETTER_AUTH_SECRET',
      })
    } else if (value.BETTER_AUTH_SECRET === DEVELOPMENT_AUTH_SECRET) {
      context.addIssue({
        code: 'custom',
        path: ['BETTER_AUTH_SECRET'],
        message: '生产环境不能使用开发默认密钥',
      })
    }

    if (!value.BETTER_AUTH_URL) {
      context.addIssue({
        code: 'custom',
        path: ['BETTER_AUTH_URL'],
        message: '生产环境必须设置 BETTER_AUTH_URL',
      })
    }

    if (!value.TRUST_PROXY) {
      context.addIssue({
        code: 'custom',
        path: ['TRUST_PROXY'],
        message: '生产环境必须显式设置 TRUST_PROXY',
      })
    }

    if (value.AUTH_EMAIL_PROVIDER !== 'resend') {
      context.addIssue({
        code: 'custom',
        path: ['AUTH_EMAIL_PROVIDER'],
        message: '生产环境必须使用 resend 邮件 provider',
      })
    }

    if (!value.AUTH_EMAIL_FROM) {
      context.addIssue({
        code: 'custom',
        path: ['AUTH_EMAIL_FROM'],
        message: '生产环境必须设置 AUTH_EMAIL_FROM',
      })
    }

    if (!value.RESEND_API_KEY) {
      context.addIssue({
        code: 'custom',
        path: ['RESEND_API_KEY'],
        message: '生产环境必须设置 RESEND_API_KEY',
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
