import type { ChatSession, Message } from "@/types/chat";

type SessionsResponse = {
  sessions: ChatSession[];
};

type SessionResponse = {
  session: ChatSession;
};

type MessagesResponse = {
  messages: Message[];
};

async function parseJsonResponse<T>(response: Response): Promise<T> {
  if (response.ok) {
    return (await response.json()) as T;
  }

  const text = await response.text();
  throw new Error(text || `HTTP ${response.status}`);
}

export async function fetchSessions() {
  const response = await fetch("/api/sessions");
  const data = await parseJsonResponse<SessionsResponse>(response);
  return data.sessions;
}

export async function createSession(title?: string) {
  const response = await fetch("/api/sessions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(title ? { title } : {}),
  });
  const data = await parseJsonResponse<SessionResponse>(response);
  return data.session;
}

export async function fetchSessionMessages(sessionId: string) {
  const response = await fetch(`/api/sessions/${sessionId}/messages`);
  const data = await parseJsonResponse<MessagesResponse>(response);
  return data.messages;
}
