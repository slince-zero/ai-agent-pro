import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { config as loadDotenv } from 'dotenv'
import { defineConfig } from 'prisma/config'

const packageRoot = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(packageRoot, '..', '..')

for (const envPath of [path.join(repoRoot, '.env'), path.join(packageRoot, '.env')]) {
  loadDotenv({ path: envPath, override: false, quiet: true })
}

const databaseUrl =
  process.env.DATABASE_URL ?? 'postgresql://ai_agent:ai_agent@localhost:5432/ai_pro_agent'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: databaseUrl,
  },
})
