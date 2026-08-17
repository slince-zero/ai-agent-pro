export function loadConfig(env: NodeJS.ProcessEnv) {
  return {
    port: Number(env.PORT ?? 3000),
  }
}
