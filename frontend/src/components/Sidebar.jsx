import React, { useEffect, useState } from "react"
import {
  MessageSquarePlus,
  Radio,
  FileText,
  Database,
  CheckCircle2,
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
  const [healthLoading, setHealthLoading] = useState(false)

  async function fetchHealth() {
    setHealthLoading(true)
    try {
      const res = await fetch("/api/health")
      if (res.ok) {
        const data = await res.json()
        setHealth(data)
      }
    } catch {
      setHealth({ status: "offline", db_ok: false, model_ok: false, chunks: 0 })
    } finally {
      setHealthLoading(false)
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
        />
      )}

      <aside
        className={cn(
          "fixed md:static inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-transform duration-300 ease-in-out shrink-0",
          isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        {/* App Branding & New Chat */}
        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-md shadow-blue-500/20">
                <Bot className="h-5 w-5" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-semibold tracking-tight">
                  3GPP CRAG Assistant
                </span>
                <span className="text-[11px] text-muted-foreground">
                  Spec Grounded RAG
                </span>
              </div>
            </div>

            <Button
              variant="ghost"
              size="iconSm"
              onClick={onToggleTheme}
              title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              className="text-muted-foreground hover:text-foreground"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </div>

          <Button
            onClick={onNewChat}
            className="w-full justify-start gap-2 bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 font-medium"
            size="sm"
          >
            <MessageSquarePlus className="h-4 w-4" />
            <span>New Chat</span>
          </Button>
        </div>

        <Separator className="bg-sidebar-border" />

        <ScrollArea className="flex-1 px-3 py-2">
          {/* Recent Conversations */}
          {conversations.length > 0 && (
            <div className="mb-4">
              <div className="px-2 py-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                Recent Chats
              </div>
              <div className="space-y-1">
                {conversations.map((conv) => (
                  <div
                    key={conv.id}
                    className={cn(
                      "group flex items-center justify-between rounded-lg px-2.5 py-2 text-xs transition-all cursor-pointer",
                      conv.id === currentId
                        ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                        : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
                    )}
                    onClick={() => onSelectConversation(conv.id)}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <Sparkles className="h-3.5 w-3.5 shrink-0 opacity-70" />
                      <span className="truncate">{conv.title || "Untitled Session"}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="iconSm"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation()
                        onDeleteConversation(conv.id)
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick 3GPP Topics */}
          <div className="space-y-3">
            <div className="px-2 py-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              3GPP Standards Knowledge
            </div>
            {PROMPT_CATEGORIES.map((cat, idx) => {
              const Icon = cat.icon
              return (
                <div key={idx} className="rounded-lg border border-sidebar-border/60 bg-card/30 p-2.5 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                    <Icon className="h-3.5 w-3.5 text-primary" />
                    <span>{cat.title}</span>
                  </div>
                  <div className="space-y-1 pt-0.5">
                    {cat.prompts.map((p, pIdx) => (
                      <button
                        key={pIdx}
                        onClick={() => onSelectPrompt(p)}
                        className="group flex w-full items-center justify-between text-left text-[11px] text-muted-foreground hover:text-primary transition-colors py-1 px-1.5 rounded hover:bg-sidebar-accent/40 cursor-pointer"
                      >
                        <span className="truncate pr-1">{p}</span>
                        <ChevronRight className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
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
          <div className="rounded-lg border border-sidebar-border/80 bg-background/50 p-2.5 text-xs space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Database className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-medium text-[11px]">Knowledge Base</span>
              </div>
              {health ? (
                <Badge
                  variant={health.status === "ok" ? "success" : "warning"}
                  className="text-[10px] px-1.5 py-0"
                >
                  <span
                    className={cn(
                      "inline-block h-1.5 w-1.5 rounded-full mr-1",
                      health.status === "ok" ? "bg-emerald-400 animate-pulse" : "bg-amber-400"
                    )}
                  />
                  {health.status === "ok" ? "Ready" : "Degraded"}
                </Badge>
              ) : (
                <span className="text-[10px] text-muted-foreground">Checking...</span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-1 text-[11px] text-muted-foreground">
              <div>
                Indexed Chunks:{" "}
                <strong className="text-foreground font-mono">
                  {health?.chunks ?? "—"}
                </strong>
              </div>
              <div className="text-right">
                CRAG: <strong className="text-foreground">Active</strong>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}
