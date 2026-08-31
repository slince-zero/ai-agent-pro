export class ToolConfigurationError extends Error {
  override name = 'ToolConfigurationError'
}

export class ToolProviderHttpError extends Error {
  override name = 'ToolProviderHttpError'

  constructor(
    message: string,
    readonly status: number,
  ) {
    super(`${message} with HTTP ${status}`)
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}
