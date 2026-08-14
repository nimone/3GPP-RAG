import React, { useEffect, useState } from "react"
import {
  MessageSquarePlus,
  Radio,
  FileText,
  Database,
  AlertTriangle,
  Moon,
  Sun,
  Trash2,
  Sparkles,
  Bot,
  ShieldCheck,
  ChevronRight,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

const PROMPT_CATEGORIES = [
  {
    title: "Fault Management (TS 28.111)",
    icon: AlertTriangle,
    prompts: [
      "What is an alarm notification in 3GPP fault management?",
      "What are the requirements for alarm supervision in 3GPP?",
      "What does the AlarmRecord schema contain?",
      "What is alarm correlation?",
    ],
  },
  {
    title: "Management Services (TS 28.532)",
    icon: FileText,
    prompts: [
      "What is the heartbeat notification used for?",
      "What is the getMOIAttributes operation?",
      "What is the performance data file naming convention?",
      "How is streaming data reported in management services?",
    ],
  },
  {
    title: "5G NR KPIs (TS 28.552)",
    icon: Radio,
    prompts: [
      "Which measurements are defined for RRC connection establishment?",
      "What is virtualised resource usage measurement?",
      "What does Number of PDU Sessions failed to setup measure?",
      "What is measured by Number of MT SMS delivery procedure requests?",
    ],
  },
  {
    title: "Refusal Guardrails (Out-of-Scope)",
    icon: ShieldCheck,
    prompts: [
      "What is the capital of France?",
      "How do I configure a Cisco router interface?",
      "What is Mavenir's quarterly revenue?",
    ],
  },
]

export default function Sidebar({
  conversations,
  currentId,
  onSelectConversation,
  onNewChat,
  onDeleteConversation,
  onSelectPrompt,
  theme,
  onToggleTheme,
  isOpen,
  onClose,
}) {
  const [health, setHealth] = useState(null)

  async function fetchHealth() {
    try {
      const res = await fetch("/api/health")
      if (res.ok) {
        const data = await res.json()
        setHealth(data)
      }
    } catch {
      setHealth({ status: "offline", db_ok: false, model_ok: false, chunks: 0 })
    }
  }

  useEffect(() => {
    fetchHealth()
    const interval = setInterval(fetchHealth, 30000)
    return () => clearInterval(interval)
  }, [])

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        aria-label="Sidebar navigation"
        className={cn(
          "fixed md:static inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-transform duration-200 ease-in-out shrink-0",
          isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        {/* App Branding & New Chat */}
        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div
                className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-elevation-1"
                aria-hidden="true"
              >
                <Bot className="h-4 w-4" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-semibold tracking-tight text-foreground">
                  3GPP RAG Assistant
                </span>
                <span className="text-[10px] text-muted-foreground font-mono">
                  Spec Grounded RAG
                </span>
              </div>
            </div>

            <Button
              variant="ghost"
              size="iconSm"
              onClick={onToggleTheme}
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              className="text-muted-foreground hover:text-foreground"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
            </Button>
          </div>

          <Button
            onClick={onNewChat}
            className="w-full justify-start gap-2 bg-foreground text-background hover:bg-foreground/90 font-medium h-8 text-xs rounded-md shadow-elevation-1"
            size="sm"
            aria-label="Start new conversation"
          >
            <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden="true" />
            <span>New Chat</span>
          </Button>
        </div>

        <Separator className="bg-sidebar-border" />

        <ScrollArea className="flex-1 px-3 py-2">
          {/* Recent Conversations */}
          {conversations.length > 0 && (
            <nav className="mb-4" aria-label="Recent chats">
              <div className="px-2 py-1.5 text-[10px] font-mono font-semibold tracking-wider text-muted-foreground uppercase">
                Recent Chats
              </div>
              <div className="space-y-1" role="list">
                {conversations.map((conv) => (
                  <div
                    key={conv.id}
                    role="listitem"
                    className={cn(
                      "group flex items-center justify-between rounded-md px-2.5 py-1.5 text-xs transition-colors duration-150 cursor-pointer select-none",
                      conv.id === currentId
                        ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                        : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
                    )}
                    onClick={() => onSelectConversation(conv.id)}
                  >
                    <button
                      type="button"
                      className="flex items-center gap-2 truncate text-left bg-transparent border-0 p-0 text-inherit cursor-pointer flex-1 focus-visible:outline-none"
                      aria-label={`Select session: ${conv.title || "Untitled Session"}`}
                    >
                      <Sparkles className="h-3 w-3 shrink-0 opacity-60 text-muted-foreground" aria-hidden="true" />
                      <span className="truncate">{conv.title || "Untitled Session"}</span>
                    </button>
                    <Button
                      variant="ghost"
                      size="iconSm"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                      aria-label={`Delete conversation ${conv.title || "Untitled Session"}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        onDeleteConversation(conv.id)
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  </div>
                ))}
              </div>
            </nav>
          )}

          {/* Quick 3GPP Topics */}
          <div className="space-y-3">
            <div className="px-2 py-1 text-[10px] font-mono font-semibold tracking-wider text-muted-foreground uppercase">
              3GPP Standards Knowledge
            </div>
            {PROMPT_CATEGORIES.map((cat, idx) => {
              const Icon = cat.icon
              return (
                <div key={idx} className="rounded-md border border-sidebar-border/80 bg-card/40 p-2.5 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                    <span>{cat.title}</span>
                  </div>
                  <div className="space-y-0.5 pt-0.5" role="list">
                    {cat.prompts.map((p, pIdx) => (
                      <button
                        key={pIdx}
                        type="button"
                        onClick={() => onSelectPrompt(p)}
                        aria-label={`Ask topic: ${p}`}
                        className="group flex w-full items-center justify-between text-left text-[11px] text-muted-foreground hover:text-foreground transition-colors duration-150 py-1 px-1.5 rounded hover:bg-sidebar-accent/40 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      >
                        <span className="truncate pr-1">{p}</span>
                        <ChevronRight className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden="true" />
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </ScrollArea>

        {/* Footer / System Status */}
        <div className="p-3 border-t border-sidebar-border bg-sidebar/50">
          <div className="rounded-md border border-sidebar-border bg-background/50 p-2.5 text-xs space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Database className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                <span className="font-medium text-[11px]">Knowledge Base</span>
              </div>
              {health ? (
                <Badge
                  variant={health.status === "ok" ? "success" : "warning"}
                  className="text-[10px] px-1.5 py-0 font-mono"
                >
                  <span
                    className={cn(
                      "inline-block h-1.5 w-1.5 rounded-full mr-1",
                      health.status === "ok" ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
                    )}
                    aria-hidden="true"
                  />
                  {health.status === "ok" ? "Ready" : "Degraded"}
                </Badge>
              ) : (
                <span className="text-[10px] text-muted-foreground">Checking…</span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-1 text-[11px] text-muted-foreground">
              <div>
                Indexed Chunks:{" "}
                <strong className="text-foreground font-mono tabular-nums">
                  {health?.chunks ?? "—"}
                </strong>
              </div>
              <div className="text-right">
                RAG: <strong className="text-foreground">Active</strong>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}
