import { apiFetch, parseJsonResponse } from '@/lib/api'
import type { ChatSession, Message } from '@/types/chat'

type SessionsResponse = {
  sessions: ChatSession[]
}

type SessionResponse = {
  session: ChatSession
}

type MessagesResponse = {
  messages: Message[]
}

export async function fetchSessions() {
  const response = await apiFetch('/api/sessions')
  const data = await parseJsonResponse<SessionsResponse>(response)
  return data.sessions
}

export async function createSession(title?: string) {
  const response = await apiFetch('/api/sessions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(title ? { title } : {}),
  })
  const data = await parseJsonResponse<SessionResponse>(response)
  return data.session
}

export async function renameSession(sessionId: string, title: string) {
  const response = await apiFetch(`/api/sessions/${sessionId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title }),
  })
  const data = await parseJsonResponse<SessionResponse>(response)
  return data.session
}

export async function deleteSession(sessionId: string) {
  const response = await apiFetch(`/api/sessions/${sessionId}`, {
    method: 'DELETE',
  })
  const data = await parseJsonResponse<SessionResponse>(response)
  return data.session
}

export async function fetchSessionMessages(sessionId: string) {
  const response = await apiFetch(`/api/sessions/${sessionId}/messages`)
  const data = await parseJsonResponse<MessagesResponse>(response)
  return data.messages
}
