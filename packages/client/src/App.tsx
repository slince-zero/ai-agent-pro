import { useCallback, useEffect, useRef, useState } from 'react'

import { ChatComposer } from '@/components/chat/chat-composer'
import { ChatHeader } from '@/components/chat/chat-header'
import { MessageList } from '@/components/chat/message-list'
import { Sidebar } from '@/components/chat/sidebar'
import { WelcomePanel } from '@/components/chat/welcome-panel'
import { RunsView } from '@/components/runs/runs-view'
import { streamChatResponse, streamRegeneratedResponse } from '@/lib/chat-stream'
import { promptPresets } from '@/lib/prompt-presets'
import {
  createSession,
  deleteSession,
  fetchSessionMessages,
  fetchSessions,
  renameSession,
} from '@/lib/sessions'
import type { ChatSession, Citation, Message } from '@/types/chat'

export default function App() {
  const [activeView, setActiveView] = useState<'chat' | 'runs'>('chat')
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [isLoadingMessages, setIsLoadingMessages] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const messageLoadIdRef = useRef(0)

  const hasMessages = messages.length > 0
  const canSend = input.trim().length > 0 && !isSending && !isLoadingMessages
  const activeSession = sessions.find((session) => session.id === activeSessionId) ?? null

  const refreshSessions = useCallback(async () => {
    const nextSessions = await fetchSessions()
    setSessions(nextSessions)
  }, [])

  const loadSessionMessages = useCallback(async (sessionId: string) => {
    const loadId = messageLoadIdRef.current + 1
    messageLoadIdRef.current = loadId
    setIsLoadingMessages(true)

    try {
      const nextMessages = await fetchSessionMessages(sessionId)
      if (messageLoadIdRef.current === loadId) {
        setMessages(nextMessages)
      }
    } finally {
      if (messageLoadIdRef.current === loadId) {
        setIsLoadingMessages(false)
      }
    }
  }, [])

  useEffect(() => {
    let ignore = false

    async function boot() {
      try {
        const nextSessions = await fetchSessions()
        if (ignore) return

        setSessions(nextSessions)
        const firstSession = nextSessions[0]
        if (!firstSession) return

        setActiveSessionId(firstSession.id)
        setIsLoadingMessages(true)
        const nextMessages = await fetchSessionMessages(firstSession.id)

        if (!ignore) {
          setMessages(nextMessages)
        }
      } catch {
        // 静默处理：消息回退到空列表，加载状态由 finally 重置
      } finally {
        if (!ignore) {
          setIsLoadingMessages(false)
        }
      }
    }

    void boot()

    return () => {
      ignore = true
    }
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'auto',
    })
  }, [messages, isSending])

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return

    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`
  }, [input])

  const updateLastAssistant = useCallback((content: string) => {
    setMessages((prev) => {
      const copy = [...prev]
      const last = copy[copy.length - 1]

      if (!last || last.role !== 'assistant') {
        return [...prev, { role: 'assistant', content }]
      }

      copy[copy.length - 1] = {
        ...last,
        content,
      }

      return copy
    })
  }, [])

  const appendLastAssistant = useCallback((text: string) => {
    setMessages((prev) => {
      const copy = [...prev]
      const last = copy[copy.length - 1]

      if (!last || last.role !== 'assistant') return prev

      copy[copy.length - 1] = {
        ...last,
        content: last.content + text,
      }

      return copy
    })
  }, [])

  const markLastAssistantStopped = useCallback(() => {
    setMessages((prev) => {
      const copy = [...prev]
      const last = copy[copy.length - 1]

      if (!last || last.role !== 'assistant' || last.content.trim()) {
        return prev
      }

      copy[copy.length - 1] = {
        ...last,
        content: '<p>已停止生成。</p>',
      }

      return copy
    })
  }, [])

  const appendToolCall = useCallback((toolCallId: string, name: string, args: unknown) => {
    const id = toolCallId || `${name}-${Date.now()}`

    setMessages((prev) => {
      const copy = [...prev]
      const last = copy[copy.length - 1]

      if (!last || last.role !== 'assistant') return prev

      copy[copy.length - 1] = {
        ...last,
        toolEvents: [
          ...(last.toolEvents ?? []),
          {
            id,
            name,
            args,
            status: 'running',
          },
        ],
      }

      return copy
    })
  }, [])

  const completeToolCall = useCallback((toolCallId: string, name: string, preview: string) => {
    const fallbackId = toolCallId || `${name}-${Date.now()}`

    setMessages((prev) => {
      const copy = [...prev]
      const last = copy[copy.length - 1]

      if (!last || last.role !== 'assistant') return prev

      const toolEvents = [...(last.toolEvents ?? [])]
      const matchingIndex = toolEvents.findLastIndex(
        (event) => event.id === toolCallId || (event.name === name && event.status === 'running'),
      )

      if (matchingIndex >= 0) {
        toolEvents[matchingIndex] = {
          ...toolEvents[matchingIndex],
          status: 'done',
          preview,
        }
      } else {
        toolEvents.push({
          id: fallbackId,
          name,
          status: 'done',
          preview,
        })
      }

      copy[copy.length - 1] = {
        ...last,
        toolEvents,
      }

      return copy
    })
  }, [])

  const setLastAssistantUsage = useCallback(
    (inputTokens: number, outputTokens: number, cost: number) => {
      setMessages((prev) => {
        const copy = [...prev]
        const last = copy[copy.length - 1]

        if (!last || last.role !== 'assistant') return prev

        copy[copy.length - 1] = {
          ...last,
          usage: { inputTokens, outputTokens, cost },
        }

        return copy
      })
    },
    [],
  )

  const setLastAssistantCitations = useCallback((citations: Citation[]) => {
    setMessages((prev) => {
      const copy = [...prev]
      const last = copy[copy.length - 1]

      if (!last || last.role !== 'assistant') return prev

      copy[copy.length - 1] = {
        ...last,
        citations,
      }

      return copy
    })
  }, [])

  const selectSession = useCallback(
    async (sessionId: string) => {
      if (isSending || sessionId === activeSessionId) return

      setActiveView('chat')
      setActiveSessionId(sessionId)
      setMessages([])
      await loadSessionMessages(sessionId)
      textareaRef.current?.focus()
    },
    [activeSessionId, isSending, loadSessionMessages],
  )

  const prependSession = useCallback((session: ChatSession) => {
    setSessions((prev) => [session, ...prev.filter((item) => item.id !== session.id)])
  }, [])

  const ensureActiveSession = useCallback(
    async (content: string) => {
      if (activeSessionId) return activeSessionId

      const session = await createSession(
        content.length > 40 ? `${content.slice(0, 40)}...` : content,
      )
      setActiveSessionId(session.id)
      prependSession(session)
      return session.id
    },
    [activeSessionId, prependSession],
  )

  const sendMessage = useCallback(async () => {
    const content = input.trim()
    if (!content || isSending) return

    setIsSending(true)

    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      const sessionId = await ensureActiveSession(content)
      setMessages((prev) => [
        ...prev,
        { role: 'user', content },
        { role: 'assistant', content: '' },
      ])
      setInput('')

      await streamChatResponse(
        sessionId,
        content,
        {
          onText: appendLastAssistant,
          onCitations: setLastAssistantCitations,
          onToolCall: appendToolCall,
          onToolResult: completeToolCall,
          onUsage: setLastAssistantUsage,
        },
        { signal: controller.signal },
      )
      await refreshSessions()
    } catch (error) {
      if (controller.signal.aborted) {
        return
      }

      const message = error instanceof Error ? error.message : '请求失败'
      updateLastAssistant(`请求失败：${message}`)
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null
      }
      setIsSending(false)
    }
  }, [
    appendLastAssistant,
    appendToolCall,
    completeToolCall,
    ensureActiveSession,
    input,
    isSending,
    refreshSessions,
    setLastAssistantCitations,
    setLastAssistantUsage,
    updateLastAssistant,
  ])

  const regenerateLastAssistant = useCallback(async () => {
    if (!activeSessionId || isSending) return

    const lastMessage = messages[messages.length - 1]
    if (!lastMessage || lastMessage.role !== 'assistant') return

    setIsSending(true)

    const controller = new AbortController()
    abortControllerRef.current = controller

    setMessages((prev) => {
      const copy = [...prev]
      const last = copy[copy.length - 1]

      if (!last || last.role !== 'assistant') return prev

      copy[copy.length - 1] = {
        ...last,
        content: '',
        citations: undefined,
        toolEvents: [],
        usage: undefined,
      }

      return copy
    })

    try {
      await streamRegeneratedResponse(
        activeSessionId,
        {
          onText: appendLastAssistant,
          onCitations: setLastAssistantCitations,
          onToolCall: appendToolCall,
          onToolResult: completeToolCall,
          onUsage: setLastAssistantUsage,
        },
        { signal: controller.signal },
      )
      await refreshSessions()
    } catch (error) {
      if (controller.signal.aborted) {
        return
      }

      const message = error instanceof Error ? error.message : '重新生成失败'
      updateLastAssistant(`重新生成失败：${message}`)
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null
      }
      setIsSending(false)
    }
  }, [
    activeSessionId,
    appendLastAssistant,
    appendToolCall,
    completeToolCall,
    isSending,
    messages,
    refreshSessions,
    setLastAssistantCitations,
    setLastAssistantUsage,
    updateLastAssistant,
  ])

  const renameExistingSession = useCallback(
    async (session: ChatSession) => {
      if (isSending) return

      const nextTitle = window.prompt('重命名会话', session.title)?.trim()
      if (!nextTitle || nextTitle === session.title) return

      const updated = await renameSession(session.id, nextTitle)
      setSessions((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
    },
    [isSending],
  )

  const deleteExistingSession = useCallback(
    async (sessionId: string) => {
      if (isSending) return

      const session = sessions.find((item) => item.id === sessionId)
      const confirmed = window.confirm(`删除会话“${session?.title ?? '未命名会话'}”？`)
      if (!confirmed) return

      await deleteSession(sessionId)
      const nextSessions = sessions.filter((item) => item.id !== sessionId)
      setSessions(nextSessions)

      if (activeSessionId !== sessionId) return

      const nextSession = nextSessions[0]
      if (!nextSession) {
        setActiveSessionId(null)
        setMessages([])
        setInput('')
        return
      }

      setActiveSessionId(nextSession.id)
      await loadSessionMessages(nextSession.id)
    },
    [activeSessionId, isSending, loadSessionMessages, sessions],
  )

  const stopGeneration = useCallback(() => {
    abortControllerRef.current?.abort()
    markLastAssistantStopped()
    setIsSending(false)
  }, [markLastAssistantStopped])

  const startNewChat = useCallback(() => {
    if (isSending) return

    setActiveView('chat')
    setActiveSessionId(null)
    setMessages([])
    setInput('')
    textareaRef.current?.focus()
  }, [isSending])

  const fillSuggestedPrompt = useCallback((prompt: string) => {
    setActiveView('chat')
    setInput(prompt)
    textareaRef.current?.focus()
  }, [])

  const selectRuns = useCallback(() => {
    if (isSending) return
    setActiveView('runs')
  }, [isSending])

  return (
    <main className="bg-background text-foreground grid h-svh overflow-hidden md:grid-cols-[260px_minmax(0,1fr)]">
      <Sidebar
        activeSessionId={activeSessionId}
        activeView={activeView}
        isSending={isSending}
        isLoadingMessages={isLoadingMessages}
        sessions={sessions}
        onNewChat={startNewChat}
        onDeleteSession={(sessionId) => void deleteExistingSession(sessionId)}
        onRenameSession={(session) => void renameExistingSession(session)}
        onSelectRuns={selectRuns}
        onSelectSession={(sessionId) => void selectSession(sessionId)}
      />

      <section className="grid h-svh min-w-0 grid-rows-[auto_minmax(0,1fr)_auto]">
        <ChatHeader
          activeSessionTitle={activeSession?.title}
          activeView={activeView}
          isSending={isSending}
          onNewChat={startNewChat}
          onSelectChat={() => setActiveView('chat')}
          onSelectRuns={selectRuns}
        />

        <div
          className="min-h-0 scrollbar-gutter-stable overflow-y-auto overscroll-contain px-4 md:px-6"
          ref={scrollRef}
        >
          {activeView === 'runs' ? (
            <RunsView />
          ) : isLoadingMessages ? (
            <div className="text-muted-foreground mx-auto flex min-h-full w-full max-w-3xl items-center justify-center py-16 text-sm">
              正在加载会话
            </div>
          ) : !hasMessages ? (
            <WelcomePanel presets={promptPresets} onSelectPrompt={fillSuggestedPrompt} />
          ) : (
            <MessageList
              messages={messages}
              isSending={isSending}
              onRegenerate={() => void regenerateLastAssistant()}
            />
          )}
        </div>

        {activeView === 'chat' && (
          <ChatComposer
            canSend={canSend}
            input={input}
            isSending={isSending}
            textareaRef={textareaRef}
            onInputChange={setInput}
            onStop={stopGeneration}
            onSubmit={() => void sendMessage()}
          />
        )}
      </section>
    </main>
  )
}
