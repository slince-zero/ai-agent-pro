import { createApp } from './app.js'
import { env } from './env.js'
import { logger } from './logger.js'

const app = createApp()

app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'server started')
})
