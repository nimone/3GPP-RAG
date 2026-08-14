import React, { useState, useEffect, useRef } from "react"
import {
  Menu,
  Sliders,
  Bot,
  Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import Sidebar from "@/components/Sidebar"
import ChatMessage from "@/components/ChatMessage"
import ChatInput from "@/components/ChatInput"
import EmptyState from "@/components/EmptyState"
import InspectorSheet from "@/components/InspectorSheet"

const STORAGE_KEY = "3gpp_rag_chats_v2"
const THEME_KEY = "3gpp_rag_theme"

function createNewSession() {
  return {
    id: "session-" + Date.now(),
    title: "New Conversation",
    messages: [],
    createdAt: new Date().toISOString(),
  }
}

export default function App() {
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem(THEME_KEY) || "dark"
  })
  const [conversations, setConversations] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) return parsed
      }
    } catch (e) {
      console.error("Failed to load chats:", e)
    }
    return [createNewSession()]
  })
  const [currentId, setCurrentId] = useState(() => {
    return conversations[0]?.id || ""
  })

  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [activeInspectorMessage, setActiveInspectorMessage] = useState(null)
  const [inspectorOpen, setInspectorOpen] = useState(false)

  const messagesEndRef = useRef(null)
  const abortControllerRef = useRef(null)

  // Sync theme class
  useEffect(() => {
    const root = document.documentElement
    if (theme === "dark") {
      root.classList.add("dark")
      root.classList.remove("light")
    } else {
      root.classList.add("light")
      root.classList.remove("dark")
    }
    localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  // Sync conversations to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations))
  }, [conversations])

  const currentConversation =
    conversations.find((c) => c.id === currentId) || conversations[0]

  // Auto-scroll on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [currentConversation?.messages, loading])

  function toggleTheme() {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"))
  }

  function handleNewChat() {
    const newSession = createNewSession()
    setConversations((prev) => [newSession, ...prev])
    setCurrentId(newSession.id)
    setActiveInspectorMessage(null)
    setInspectorOpen(false)
    setSidebarOpen(false)
  }

  function handleDeleteConversation(id) {
    const remaining = conversations.filter((c) => c.id !== id)
    if (remaining.length === 0) {
      const fresh = createNewSession()
      setConversations([fresh])
      setCurrentId(fresh.id)
    } else {
      setConversations(remaining)
      if (currentId === id) {
        setCurrentId(remaining[0].id)
      }
    }
  }

  function handleClearCurrentChat() {
    if (!currentConversation) return
    setConversations((prev) =>
      prev.map((c) => (c.id === currentId ? { ...c, messages: [] } : c))
    )
    setActiveInspectorMessage(null)
  }

  async function handleSendMessage(questionText) {
    const text = (questionText || input).trim()
    if (!text || loading) return

    setInput("")
    setLoading(true)

    const userMessage = {
      id: "msg-" + Date.now(),
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    }

    const botMessageId = "msg-" + Date.now() + 1
    const initialBotMessage = {
      id: botMessageId,
      role: "assistant",
      content: "",
      action: "ambiguous",
      refused: false,
      citations: [],
      sources: [],
      trace: [],
      question: text,
      isStreaming: true,
      timestamp: new Date().toISOString(),
    }

    // Update conversation title if first message
    let sessionTitle = currentConversation?.title
    if (!currentConversation?.messages || currentConversation.messages.length === 0) {
      sessionTitle = text.slice(0, 32) + (text.length > 32 ? "…" : "")
    }

    setConversations((prev) =>
      prev.map((c) =>
        c.id === currentId
          ? {
              ...c,
              title: sessionTitle,
              messages: [...c.messages, userMessage, initialBotMessage],
            }
          : c
      )
    )

    abortControllerRef.current = new AbortController()

    try {
      // Try streaming endpoint first
      const res = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text }),
        signal: abortControllerRef.current.signal,
      })

      if (!res.ok || !res.body) {
        throw new Error(`Streaming failed with status ${res.status}`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let accumulatedText = ""
      let metaData = {}
      let buffer = ""

      while (true) {
        const { value, done } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() // keep unparsed fragment

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith("data:")) continue

          const jsonStr = trimmed.replace(/^data:\s*/, "")
          if (!jsonStr) continue

          try {
            const parsed = JSON.parse(jsonStr)

            if (parsed.type === "step") {
              const stepEvt = { step: parsed.step, data: parsed.data || {} }
              setConversations((prev) =>
                prev.map((c) =>
                  c.id === currentId
                    ? {
                        ...c,
                        messages: c.messages.map((m) =>
                          m.id === botMessageId
                            ? {
                                ...m,
                                currentStep: parsed.step,
                                trace: [...(m.trace || []).filter((t) => t.step !== parsed.step), stepEvt],
                              }
                            : m
                        ),
                      }
                    : c
                )
              )
            } else if (parsed.type === "meta") {
              metaData = parsed
              // Open inspector automatically when metadata is available
              const currentMeta = {
                ...initialBotMessage,
                action: parsed.action,
                refused: parsed.refused,
                citations: parsed.citations || [],
                sources: parsed.sources || [],
                trace: parsed.trace || [],
              }
              setActiveInspectorMessage(currentMeta)

              setConversations((prev) =>
                prev.map((c) =>
                  c.id === currentId
                    ? {
                        ...c,
                        messages: c.messages.map((m) =>
                          m.id === botMessageId
                            ? {
                                ...m,
                                action: parsed.action,
                                refused: parsed.refused,
                                citations: parsed.citations || [],
                                sources: parsed.sources || [],
                                trace: parsed.trace || m.trace || [],
                              }
                            : m
                        ),
                      }
                    : c
                )
              )
            } else if (parsed.type === "delta") {
              accumulatedText += parsed.text
              setConversations((prev) =>
                prev.map((c) =>
                  c.id === currentId
                    ? {
                        ...c,
                        messages: c.messages.map((m) =>
                          m.id === botMessageId
                            ? { ...m, content: accumulatedText }
                            : m
                        ),
                      }
                    : c
                )
              )
            } else if (parsed.type === "done") {
              // Finalize message
              const finalMessage = {
                ...initialBotMessage,
                ...metaData,
                content: accumulatedText,
                isStreaming: false,
              }
              setActiveInspectorMessage(finalMessage)

              setConversations((prev) =>
                prev.map((c) =>
                  c.id === currentId
                    ? {
                        ...c,
                        messages: c.messages.map((m) =>
                          m.id === botMessageId
                            ? { ...m, isStreaming: false, content: accumulatedText }
                            : m
                        ),
                      }
                    : c
                )
              )
            }
          } catch (e) {
            console.error("Error parsing stream chunk:", e)
          }
        }
      }
    } catch (err) {
      if (err.name === "AbortError") return

      console.warn("Falling back to standard /api/chat due to:", err)

      // Fallback to standard /api/chat
      try {
        const fallbackRes = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: text }),
        })

        if (!fallbackRes.ok) throw new Error(`HTTP ${fallbackRes.status}`)
        const data = await fallbackRes.json()

        const finalMsg = {
          id: botMessageId,
          role: "assistant",
          content: data.answer,
          action: data.action,
          refused: data.refused,
          citations: data.citations || [],
          sources: data.sources || [],
          trace: data.trace || [],
          question: text,
          isStreaming: false,
          timestamp: new Date().toISOString(),
        }

        setConversations((prev) =>
          prev.map((c) =>
            c.id === currentId
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === botMessageId ? finalMsg : m
                  ),
                }
              : c
          )
        )

        // Automatically open inspector with response
        setActiveInspectorMessage(finalMsg)
        setInspectorOpen(true)
      } catch (fallbackErr) {
        const errorMsg = {
          id: botMessageId,
          role: "assistant",
          content: `**Error communicating with 3GPP backend:** ${fallbackErr.message}. Ensure backend API is active on port 8000.`,
          action: "incorrect",
          refused: true,
          citations: [],
          sources: [],
          trace: [],
          question: text,
          isStreaming: false,
          timestamp: new Date().toISOString(),
        }

        setConversations((prev) =>
          prev.map((c) =>
            c.id === currentId
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === botMessageId ? errorMsg : m
                  ),
                }
              : c
          )
        )
      }
    } finally {
      setLoading(false)
      abortControllerRef.current = null
    }
  }

  function handleStop() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      setLoading(false)
    }
  }

  function handleOpenInspector(msg) {
    setActiveInspectorMessage(msg)
    setInspectorOpen(true)
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      {/* Skip to content link for accessibility */}
      <a
        href="#main-chat-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-3 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:m-2"
      >
        Skip to main content
      </a>

      {/* Sidebar Navigation */}
      <Sidebar
        conversations={conversations}
        currentId={currentId}
        onSelectConversation={(id) => {
          setCurrentId(id)
          setSidebarOpen(false)
        }}
        onNewChat={handleNewChat}
        onDeleteConversation={handleDeleteConversation}
        onSelectPrompt={(p) => {
          setInput(p)
          handleSendMessage(p)
        }}
        theme={theme}
        onToggleTheme={toggleTheme}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main Workspace */}
      <div className="relative flex flex-1 flex-col overflow-hidden min-w-0">
        {/* Top Navigation Bar */}
        <header
          role="banner"
          className="flex h-12 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur-md z-20 shrink-0"
        >
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="iconSm"
              className="md:hidden"
              onClick={() => setSidebarOpen(true)}
              aria-label="Toggle navigation sidebar"
            >
              <Menu className="h-4 w-4" aria-hidden="true" />
            </Button>

            <div className="flex items-center gap-2">
              <span className="font-semibold text-xs tracking-tight text-foreground">
                3GPP CRAG Graph
              </span>
              <Badge variant="outline" className="hidden sm:inline-flex text-[10px] font-mono py-0">
                Rel-18 Grounded
              </Badge>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {currentConversation?.messages.length > 0 && (
              <Button
                variant="ghost"
                size="iconSm"
                onClick={handleClearCurrentChat}
                aria-label="Clear current conversation messages"
                title="Clear current conversation"
                className="text-muted-foreground hover:text-foreground h-7 w-7"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            )}

            {activeInspectorMessage && (
              <Button
                variant={inspectorOpen ? "default" : "outline"}
                size="sm"
                className="h-7 gap-1.5 text-xs font-medium px-2.5"
                onClick={() => setInspectorOpen(!inspectorOpen)}
                aria-label="Toggle CRAG Reasoning Inspector sheet"
              >
                <Sliders className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">CRAG Inspector</span>
              </Button>
            )}
          </div>
        </header>

        {/* Chat Area + Right Inspector Layout */}
        <main id="main-chat-content" role="main" className="flex flex-1 overflow-hidden min-w-0">
          {/* Messages Column */}
          <div className="flex flex-1 flex-col overflow-hidden relative min-w-0">
            <div className="flex-1 overflow-y-auto">
              {!currentConversation?.messages?.length ? (
                <EmptyState
                  onSelectPrompt={(p) => {
                    setInput(p)
                    handleSendMessage(p)
                  }}
                />
              ) : (
                <div className="flex flex-col pb-4 max-w-4xl mx-auto w-full">
                  {currentConversation.messages.map((msg, idx) => (
                    <ChatMessage
                      key={msg.id || idx}
                      message={msg}
                      onOpenInspector={handleOpenInspector}
                      onSelectSource={() => {
                        setActiveInspectorMessage(msg)
                        setInspectorOpen(true)
                      }}
                      isLatest={
                        idx === currentConversation.messages.length - 1 &&
                        msg.role === "assistant"
                      }
                    />
                  ))}

                  {/* Initial loading state before first stream chunk */}
                  {loading &&
                    !currentConversation.messages.some(
                      (m) => m.role === "assistant" && m.isStreaming
                    ) && (
                      <div
                        className="flex w-full justify-start gap-3.5 px-4 py-4 sm:px-6 animate-in fade-in duration-200"
                        aria-live="polite"
                      >
                        <div
                          className="flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-elevation-1 animate-pulse"
                          aria-hidden="true"
                        >
                          <Bot className="h-4 w-4" />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-foreground">
                              3GPP Assistant
                            </span>
                            <Badge variant="outline" className="text-[10px] animate-pulse">
                              Executing CRAG Graph…
                            </Badge>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-0.5">
                            <div className="h-1.5 w-1.5 rounded-full bg-foreground animate-bounce [animation-delay:-0.3s]" />
                            <div className="h-1.5 w-1.5 rounded-full bg-foreground animate-bounce [animation-delay:-0.15s]" />
                            <div className="h-1.5 w-1.5 rounded-full bg-foreground animate-bounce" />
                            <span className="ml-1.5 text-[11px]">
                              Retrieving, evaluating &amp; formatting spec context…
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Input Bar */}
            <div className="shrink-0 bg-gradient-to-t from-background via-background/90 to-transparent pt-3">
              <ChatInput
                input={input}
                setInput={setInput}
                onSubmit={handleSendMessage}
                loading={loading}
                onStop={handleStop}
                suggestions={
                  !currentConversation?.messages?.length
                    ? []
                    : [
                        "What is an alarm notification in 3GPP fault management?",
                        "Which measurements are defined for RRC connection establishment?",
                        "What is the getMOIAttributes operation?",
                        "What is the capital of France?",
                      ]
                }
                onSelectSuggestion={(s) => {
                  setInput(s)
                  handleSendMessage(s)
                }}
              />
            </div>
          </div>

          {/* Collapsible Inspector Panel */}
          {inspectorOpen && activeInspectorMessage && (
            <InspectorSheet
              activeMessage={activeInspectorMessage}
              onClose={() => setInspectorOpen(false)}
            />
          )}
        </main>
      </div>
    </div>
  )
}
