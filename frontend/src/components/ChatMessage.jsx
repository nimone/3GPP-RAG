import React, { useState } from "react"
import {
  Bot,
  User,
  Check,
  Copy,
  BookOpen,
  Sliders,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import MarkdownRenderer from "./MarkdownRenderer"
import CitationBadge from "./CitationBadge"
import ReasoningProcess from "./ReasoningProcess"
import { ShimmerSkeleton } from "@/components/ui/shimmer"
import { cn } from "@/lib/utils"

const ACTION_CONFIG = {
  correct: {
    label: "High Confidence",
    variant: "success",
    description: "Evaluator verified retrieval chunks match the query with high similarity score.",
  },
  ambiguous: {
    label: "Ambiguous (Rewritten)",
    variant: "warning",
    description: "Initial query was ambiguous; CRAG reformulated search queries to retrieve better context.",
  },
  incorrect: {
    label: "Out of Domain / Refused",
    variant: "error",
    description: "Retrieval similarity fell below refusal threshold; model safely declined to hallucinate.",
  },
}

export default function ChatMessage({
  message,
  onOpenInspector,
  onSelectSource,
  isLatest,
}) {
  const [copied, setCopied] = useState(false)
  const [showSources, setShowSources] = useState(true)

  const isUser = message.role === "user"
  const actionInfo = !isUser && message.action ? ACTION_CONFIG[message.action] : null
  const isRefused = !isUser && message.refused
  const isStreaming = !isUser && message.isStreaming
  const hasContent = Boolean(message.content || message.answer)

  function handleCopy() {
    navigator.clipboard.writeText(message.content || message.answer || "")
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (isUser) {
    return (
      <div className="flex w-full justify-end gap-3 px-4 py-3 sm:px-6">
        <div className="flex max-w-[85%] md:max-w-[75%] flex-col items-end gap-1">
          <div className="rounded-xl bg-primary px-4 py-2.5 text-primary-foreground shadow-elevation-1">
            <p className="text-sm whitespace-pre-wrap leading-relaxed">
              {message.content}
            </p>
          </div>
          <span className="text-[11px] text-muted-foreground px-1 tabular-nums">
            {message.timestamp
              ? new Date(message.timestamp).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : ""}
          </span>
        </div>
        <div
          className="flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-full bg-secondary text-secondary-foreground border border-border shadow-elevation-1"
          aria-hidden="true"
        >
          <User className="h-4 w-4" />
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        "flex w-full justify-start gap-3.5 px-4 py-5 sm:px-6 border-b border-border/50 transition-colors duration-150",
        isLatest ? "bg-muted/20" : "hover:bg-muted/10"
      )}
    >
      {/* Bot Avatar */}
      <div
        className="flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-elevation-1"
        aria-hidden="true"
      >
        <Bot className="h-4 w-4" />
      </div>

      <div className="flex flex-1 flex-col gap-3 overflow-hidden min-w-0">
        {/* Top Meta Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold tracking-tight text-foreground">
              3GPP Assistant
            </span>

            {actionInfo && (
              <Badge variant={actionInfo.variant} className="text-[11px] font-medium">
                {actionInfo.label}
              </Badge>
            )}

            {isRefused && (
              <Badge variant="destructive" className="text-[11px]">
                Safe Refusal
              </Badge>
            )}

            {isStreaming && (
              <Badge variant="outline" className="text-[10px] animate-pulse">
                Streaming answer…
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-1.5 text-muted-foreground">
            {message.trace?.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 px-2.5 text-xs text-foreground font-medium"
                onClick={() => onOpenInspector(message)}
                aria-label="Inspect CRAG reasoning graph and confidence scores"
              >
                <Sliders className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Inspect</span>
              </Button>
            )}

            <Button
              variant="ghost"
              size="iconSm"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={handleCopy}
              aria-label="Copy assistant answer to clipboard"
              title="Copy message"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
              ) : (
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </Button>
          </div>
        </div>

        {/* Live / Collapsible Reasoning Process Accordion */}
        {(message.trace?.length > 0 || isStreaming) && (
          <ReasoningProcess
            trace={message.trace || []}
            action={message.action}
            isStreaming={isStreaming}
            currentStep={message.currentStep}
            refused={isRefused}
          />
        )}

        {/* Refusal Notice Banner */}
        {isRefused && (
          <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
            <ShieldAlert className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" aria-hidden="true" />
            <div className="space-y-0.5">
              <div className="font-semibold text-amber-300">
                Grounded 3GPP Guardrail Triggered
              </div>
              <div className="text-muted-foreground">
                This question is outside the scope of the loaded 3GPP technical specifications. To prevent hallucination, the model safely refuses.
              </div>
            </div>
          </div>
        )}

        {/* Shimmer Skeleton when waiting for first text token */}
        {isStreaming && !hasContent && (
          <div className="py-2 animate-in fade-in duration-200">
            <ShimmerSkeleton lines={3} />
          </div>
        )}

        {/* Message Content with interactive citation parsing */}
        {hasContent && (
          <div className="prose-custom" aria-live={isStreaming ? "polite" : "off"}>
            <MarkdownRenderer
              content={message.content || message.answer || ""}
              sources={message.sources || []}
              onSelectSource={onSelectSource}
            />
            {isStreaming && (
              <span
                className="inline-block h-4 w-1.5 ml-1 bg-foreground animate-pulse align-middle rounded-xs"
                aria-hidden="true"
              />
            )}
          </div>
        )}

        {/* Citations / Sources at bottom with hover preview */}
        {message.citations && message.citations.length > 0 && (
          <div className="mt-1 pt-3 border-t border-border/50">
            <button
              type="button"
              onClick={() => setShowSources(!showSources)}
              aria-expanded={showSources}
              className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors duration-150 group cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded px-1 -mx-1"
            >
              <BookOpen className="h-3.5 w-3.5 text-blue-500" aria-hidden="true" />
              <span>Grounded Sources ({message.citations.length})</span>
              <span className="text-[10px] text-muted-foreground/70 font-normal">
                (Hover to view chunk excerpt)
              </span>
              {showSources ? (
                <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </button>

            {showSources && (
              <div className="mt-2.5 flex flex-wrap gap-1.5 items-center animate-in fade-in duration-150" role="list">
                {message.citations.map((c, i) => (
                  <CitationBadge
                    key={i}
                    citation={c}
                    sources={message.sources || []}
                    onSelectSource={onSelectSource}
                    compact={false}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
