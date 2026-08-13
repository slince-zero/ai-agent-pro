import { listUsers } from './users.js'

export type ResponseData = {
  body: string
  status: number
}

export function handleRequest(pathname: string): ResponseData {
  if (pathname === '/health') {
    return { status: 200, body: JSON.stringify({ ok: true }) }
  }

  if (pathname === '/users') {
    return { status: 200, body: JSON.stringify({ users: listUsers() }) }
  }

  return { status: 404, body: JSON.stringify({ error: 'Not found' }) }
}
