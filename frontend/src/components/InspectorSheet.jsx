import React, { useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import {
  X,
  Sliders,
  Gauge,
  BookOpen,
  ChevronDown,
  ChevronUp,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

const ACTION_MAP = {
  correct: {
    color: "bg-emerald-500",
    textColor: "text-emerald-500 dark:text-emerald-400",
    bgLight: "bg-emerald-500/10",
    borderColor: "border-emerald-500/30",
    badgeVariant: "success",
    label: "Direct Answer (High Relevance)",
    desc: "Retrieval score met upper confidence threshold (≥0.55). Context is verified.",
  },
  ambiguous: {
    color: "bg-amber-500",
    textColor: "text-amber-500 dark:text-amber-400",
    bgLight: "bg-amber-500/10",
    borderColor: "border-amber-500/30",
    badgeVariant: "warning",
    label: "Query Reformulated (Ambiguous)",
    desc: "Top retrieval score was ambiguous (0.30 - 0.55). RAG reformulated query to retrieve better context.",
  },
  incorrect: {
    color: "bg-rose-500",
    textColor: "text-rose-500 dark:text-rose-400",
    bgLight: "bg-rose-500/10",
    borderColor: "border-rose-500/30",
    badgeVariant: "error",
    label: "Out of Scope (Safe Refusal)",
    desc: "Top retrieval score was below refusal threshold (<0.30). Model declined to prevent hallucination.",
  },
}

export default function InspectorSheet({ activeMessage, onClose }) {
  const [activeTab, setActiveTab] = useState("overview")
  const [expandedChunk, setExpandedChunk] = useState(null)

  if (!activeMessage) return null

  const { action, trace = [], citations = [], sources = [] } = activeMessage
  const evaluateStep = trace.find((e) => e.step === "evaluate")
  const decisionStep = trace.find((e) => e.step === "action")
  const actionMeta = ACTION_MAP[action] || ACTION_MAP.ambiguous

  const topScore =
    decisionStep?.data?.top_score ??
    (evaluateStep?.data?.scored?.[0]?.score || 0)
  const lowerThreshold = decisionStep?.data?.lower ?? 0.30
  const upperThreshold = decisionStep?.data?.upper ?? 0.55

  return (
    <aside
      aria-label="RAG Reasoning Inspector"
      className="w-full md:w-96 lg:w-[420px] border-l border-border bg-card flex flex-col h-full shadow-elevation-3 z-30 transition-transform duration-200 animate-in slide-in-from-right-4 shrink-0"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-7 w-7 items-center justify-center rounded-md bg-muted text-foreground border border-border"
            aria-hidden="true"
          >
            <Sliders className="h-3.5 w-3.5" />
          </div>
          <div>
            <h3 className="text-xs font-semibold text-foreground tracking-tight">
              RAG Reasoning Inspector
            </h3>
            <p className="text-[10px] text-muted-foreground font-mono">
              Graph Evaluation Trace
            </p>
          </div>
        </div>

        <Button
          variant="ghost"
          size="iconSm"
          onClick={onClose}
          aria-label="Close inspector"
          className="text-muted-foreground hover:text-foreground h-7 w-7"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>

      {/* Tabs */}
      <div className="px-4 pt-2.5 pb-2 border-b border-border bg-muted/30">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 h-7 bg-muted">
            <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
            <TabsTrigger value="pipeline" className="text-xs tabular-nums">Timeline ({trace.length})</TabsTrigger>
            <TabsTrigger value="raw" className="text-xs">Raw JSON</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <ScrollArea className="flex-1 p-4">
        {activeTab === "overview" && (
          <div className="space-y-4">
            {/* Graph Decision Header Card */}
            <div
              className={cn(
                "rounded-lg border p-3.5 space-y-2 shadow-elevation-1 transition-colors",
                actionMeta.borderColor,
                actionMeta.bgLight
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-muted-foreground">
                  Graph Decision
                </span>
                <Badge variant={actionMeta.badgeVariant} className="text-[10px] font-semibold uppercase px-2 py-0.5">
                  {action || "unknown"}
                </Badge>
              </div>
              <div className="text-xs font-semibold text-foreground">
                {actionMeta.label}
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {actionMeta.desc}
              </p>
            </div>

            {/* Confidence Score & Threshold Gauge */}
            <div className="rounded-lg border border-border bg-card p-3.5 space-y-3 shadow-elevation-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <Gauge className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                  <span>Retrieval Relevance Score</span>
                </div>
                <div className="font-mono font-bold text-xs text-foreground bg-muted px-2 py-0.5 rounded border border-border tabular-nums">
                  {typeof topScore === "number" ? topScore.toFixed(3) : topScore}
                </div>
              </div>

              {/* Visual meter bar */}
              <div className="space-y-2 pt-1">
                <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-muted border border-border/80">
                  <div
                    className={cn(
                      "h-full transition-all duration-300 rounded-full",
                      actionMeta.color
                    )}
                    style={{
                      width: `${Math.min(Math.max((topScore || 0) * 100, 4), 100)}%`,
                    }}
                  />
                  {/* Threshold Markers */}
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-rose-500/90 z-10"
                    style={{ left: `${lowerThreshold * 100}%` }}
                    title={`Refusal Threshold (${lowerThreshold})`}
                  />
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-emerald-500/90 z-10"
                    style={{ left: `${upperThreshold * 100}%` }}
                    title={`Pass Threshold (${upperThreshold})`}
                  />
                </div>

                <div className="flex justify-between text-[10px] text-muted-foreground font-mono tabular-nums">
                  <span className="text-rose-500">Refusal (&lt;{lowerThreshold})</span>
                  <span className="text-amber-500">Retry ({lowerThreshold}-{upperThreshold})</span>
                  <span className="text-emerald-500">Direct (&ge;{upperThreshold})</span>
                </div>
              </div>
            </div>

            {/* Evaluated Chunks with Score Breakdown & Expandable Text */}
            {evaluateStep?.data?.scored && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-foreground">
                  <span className="flex items-center gap-1.5">
                    <BookOpen className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                    <span>Graded Chunks ({evaluateStep.data.scored.length})</span>
                  </span>
                </div>

                <div className="space-y-2" role="list">
                  {evaluateStep.data.scored.map((item, idx) => {
                    const scorePct = Math.round((item.score || 0) * 100)
                    const isExpanded = expandedChunk === idx
                    const matchingSource = sources.find(
                      (s) =>
                        s.citation?.toLowerCase() === item.citation?.toLowerCase() ||
                        (s.clause && item.citation?.includes(s.clause))
                    )

                    return (
                      <div
                        key={idx}
                        className="rounded-lg border border-border bg-card p-3 space-y-2 text-xs transition-colors shadow-elevation-1 hover:border-border/80"
                      >
                        <button
                          type="button"
                          className="flex items-center justify-between gap-2 w-full text-left bg-transparent border-0 p-0 cursor-pointer select-none focus-visible:outline-none"
                          onClick={() => setExpandedChunk(isExpanded ? null : idx)}
                          aria-expanded={isExpanded}
                          aria-label={`Toggle chunk excerpt for ${item.citation}`}
                        >
                          <code className="text-[11px] font-mono text-foreground font-semibold truncate max-w-[200px]">
                            {item.citation}
                          </code>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-foreground tabular-nums">
                              {Number(item.score).toFixed(3)}
                            </span>
                            {isExpanded ? (
                              <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                            ) : (
                              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                            )}
                          </div>
                        </button>

                        {/* Similarity Bar */}
                        <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all duration-300",
                              item.score >= upperThreshold
                                ? "bg-emerald-500"
                                : item.score >= lowerThreshold
                                ? "bg-amber-500"
                                : "bg-rose-500"
                            )}
                            style={{ width: `${scorePct}%` }}
                          />
                        </div>

                        {/* Expandable Chunk Excerpt */}
                        {isExpanded && (
                          <div className="pt-2 border-t border-border text-[11px] text-muted-foreground space-y-1 animate-in fade-in duration-150">
                            {matchingSource?.title && (
                              <div className="font-semibold text-foreground">
                                {matchingSource.title}
                              </div>
                            )}
                            <div className="prose-custom text-[11px] leading-relaxed bg-muted/40 p-2.5 rounded border border-border">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {matchingSource?.text ||
                                  "Clause chunk text retrieved from BM25 + Jina reranking index."}
                              </ReactMarkdown>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "pipeline" && (
          <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-px before:bg-border">
            {trace.map((evt, idx) => (
              <div key={idx} className="relative space-y-1.5">
                {/* Node dot */}
                <div
                  className="absolute -left-6 top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-card border-2 border-foreground shadow-xs"
                  aria-hidden="true"
                >
                  <div className="h-1 w-1 rounded-full bg-foreground" />
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold capitalize text-foreground font-mono">
                    {evt.step}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-mono tabular-nums">
                    Step {idx + 1}
                  </span>
                </div>

                <div className="rounded-lg border border-border bg-muted/30 p-2.5 text-xs text-muted-foreground">
                  {evt.step === "retrieve" && (
                    <div className="space-y-1">
                      <div>
                        Query: <strong className="text-foreground">"{evt.data.query}"</strong>
                      </div>
                      <div className="tabular-nums">
                        Retrieved <strong className="text-foreground">{evt.data.count}</strong> chunks
                      </div>
                    </div>
                  )}

                  {evt.step === "rewrite" && (
                    <div className="space-y-1">
                      <div className="text-[10px] text-muted-foreground">Original Question:</div>
                      <div className="italic text-muted-foreground text-[11px]">"{evt.data.original}"</div>
                      <div className="text-[10px] font-semibold text-foreground pt-1">
                        Rewritten Query:
                      </div>
                      <div className="font-mono text-[11px] text-foreground bg-background p-1.5 rounded border border-border">
                        {evt.data.rewritten}
                      </div>
                    </div>
                  )}

                  {evt.step === "evaluate" && (
                    <div className="tabular-nums">
                      Scored{" "}
                      <strong className="text-foreground">
                        {evt.data.scored?.length || 0}
                      </strong>{" "}
                      chunks with Jina Reranker
                    </div>
                  )}

                  {evt.step === "refine" && (
                    <div className="tabular-nums">
                      Kept{" "}
                      <strong className="text-emerald-500">
                        {evt.data.kept_chunks}
                      </strong>{" "}
                      sentences across {evt.data.context_chars} characters
                    </div>
                  )}

                  {evt.step === "refuse" && (
                    <div className="text-rose-500 font-medium">
                      Refusal triggered: {evt.data.reason}
                    </div>
                  )}

                  {evt.step === "action" && (
                    <div className="tabular-nums">
                      RAG Action:{" "}
                      <strong className="text-foreground uppercase">
                        {evt.data.action}
                      </strong>{" "}
                      (Top score: {evt.data.top_score})
                    </div>
                  )}

                  {!["retrieve", "rewrite", "evaluate", "refine", "refuse", "action"].includes(
                    evt.step
                  ) && (
                    <pre className="text-[10px] whitespace-pre-wrap font-mono tabular-nums">
                      {JSON.stringify(evt.data, null, 2)}
                    </pre>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === "raw" && (
          <div className="rounded-lg border border-border bg-muted/40 p-3">
            <pre className="text-[11px] font-mono text-muted-foreground whitespace-pre-wrap overflow-x-auto tabular-nums">
              {JSON.stringify({ action, trace, citations, sources }, null, 2)}
            </pre>
          </div>
        )}
      </ScrollArea>
    </aside>
  )
}
