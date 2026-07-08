const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])
const SYSTEM_DATABASES = new Set(['postgres', 'template0', 'template1'])

export type DatabaseResetTarget = {
  protocol: string
  hostname: string
  port: string
  database: string
  username: string
}

export type DatabaseResetGuardOptions = {
  allowNonLocal?: boolean
  confirm?: boolean
  nodeEnv?: string
  requireConfirmation?: boolean
}

export function parseDatabaseResetTarget(databaseUrl: string): DatabaseResetTarget {
  let url: URL
  try {
    url = new URL(databaseUrl)
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL URL.')
  }

  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    throw new Error('DATABASE_URL must use the postgresql:// or postgres:// protocol.')
  }

  const database = decodeURIComponent(url.pathname.replace(/^\/+/, '')).trim()
  if (!database) {
    throw new Error('DATABASE_URL must include a database name.')
  }

  return {
    protocol: url.protocol,
    hostname: url.hostname.replace(/^\[(.*)\]$/, '$1'),
    port: url.port,
    database,
    username: decodeURIComponent(url.username),
  }
}

export function formatDatabaseResetTarget(target: DatabaseResetTarget): string {
  const auth = target.username ? `${target.username}@` : ''
  const port = target.port ? `:${target.port}` : ''
  return `${target.protocol}//${auth}${target.hostname}${port}/${target.database}`
}

export function assertSafeLocalDatabaseReset(
  databaseUrl: string,
  options: DatabaseResetGuardOptions = {},
): DatabaseResetTarget {
  const target = parseDatabaseResetTarget(databaseUrl)
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV ?? 'development'
  const requireConfirmation = options.requireConfirmation ?? true

  if (nodeEnv === 'production') {
    throw new Error('Refusing to reset the database while NODE_ENV=production.')
  }

  if (requireConfirmation && !options.confirm) {
    throw new Error('Refusing to reset the database without --confirm-local-reset.')
  }

  if (!options.allowNonLocal && !LOCAL_HOSTS.has(target.hostname)) {
    throw new Error(
      `Refusing to reset non-local database host "${target.hostname}". Set ALLOW_NON_LOCAL_DB_RESET=true only for an intentional throwaway database.`,
    )
  }

  if (SYSTEM_DATABASES.has(target.database.toLowerCase())) {
    throw new Error(`Refusing to reset system database "${target.database}".`)
  }

  return target
}
