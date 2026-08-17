import { createServer } from 'node:http'

import { handleRequest } from './app.js'
import { loadConfig } from './config.js'

const config = loadConfig(process.env)

createServer((request, response) => {
  const result = handleRequest(request.url ?? '/')
  response.writeHead(result.status, { 'content-type': 'application/json' })
  response.end(result.body)
}).listen(config.port)
