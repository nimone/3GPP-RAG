import React, { useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import {
  X,
  Activity,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileCode,
  ListTree,
  Gauge,
  Sparkles,
  Layers,
  ArrowRight,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Search,
  Filter,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

const ACTION_MAP = {
  correct: {
    color: "bg-emerald-500",
    textColor: "text-emerald-400 dark:text-emerald-300",
    bgLight: "bg-emerald-500/10",
    borderColor: "border-emerald-500/30",
    badgeVariant: "success",
    label: "Direct Answer (High Relevance)",
    desc: "Retrieval score exceeded upper threshold (≥0.6). Context is highly grounded.",
  },
  ambiguous: {
    color: "bg-amber-500",
    textColor: "text-amber-400 dark:text-amber-300",
    bgLight: "bg-amber-500/10",
    borderColor: "border-amber-500/30",
    badgeVariant: "warning",
    label: "Query Reformulated (Ambiguous)",
    desc: "Top retrieval score was ambiguous (0.3 - 0.6). CRAG rewrote search query to find better chunks.",
  },
  incorrect: {
    color: "bg-rose-500",
    textColor: "text-rose-400 dark:text-rose-300",
    bgLight: "bg-rose-500/10",
    borderColor: "border-rose-500/30",
    badgeVariant: "error",
    label: "Out of Scope (Safe Refusal)",
    desc: "Top retrieval score was below refusal threshold (<0.3). Model declined to prevent hallucination.",
  },
}

export default function InspectorSheet({ activeMessage, onClose }) {
  const [activeTab, setActiveTab] = useState("overview")
  const [expandedChunk, setExpandedChunk] = useState(null)

  if (!activeMessage) return null

  const { action, trace = [], question, citations = [], sources = [] } = activeMessage
  const evaluateStep = trace.find((e) => e.step === "evaluate")
  const decisionStep = trace.find((e) => e.step === "action")
  const actionMeta = ACTION_MAP[action] || ACTION_MAP.ambiguous

  const topScore =
    decisionStep?.data?.top_score ??
    (evaluateStep?.data?.scored?.[0]?.score || 0)
  const lowerThreshold = decisionStep?.data?.lower ?? 0.3
  const upperThreshold = decisionStep?.data?.upper ?? 0.6

  return (
    <aside className="w-full md:w-96 lg:w-[420px] border-l border-border bg-card/98 backdrop-blur-xl flex flex-col h-full shadow-2xl z-30 transition-all duration-300 animate-in slide-in-from-right-4">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-border bg-card">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 shadow-xs">
            <Sliders className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground tracking-tight">
              CRAG Reasoning Inspector
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Real-time Corrective RAG Trace
            </p>
          </div>
        </div>

        <Button
          variant="ghost"
          size="iconSm"
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground h-8 w-8"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Tabs */}
      <div className="px-4 pt-3 pb-2 bg-muted/20 border-b border-border/40">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 h-8 bg-muted/60">
            <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
            <TabsTrigger value="pipeline" className="text-xs">Timeline ({trace.length})</TabsTrigger>
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
                "rounded-xl border p-4 space-y-2.5 shadow-xs transition-colors",
                actionMeta.borderColor,
                actionMeta.bgLight
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Decision
                </span>
                <Badge variant={actionMeta.badgeVariant} className="text-[11px] font-semibold uppercase px-2.5 py-0.5">
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
            <div className="rounded-xl border border-border bg-background/60 p-4 space-y-3 shadow-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <Gauge className="h-3.5 w-3.5 text-blue-400" />
                  <span>Retrieval Relevance Score</span>
                </div>
                <div className="font-mono font-bold text-sm text-foreground bg-muted/60 px-2 py-0.5 rounded-md border border-border">
                  {typeof topScore === "number" ? topScore.toFixed(3) : topScore}
                </div>
              </div>

              {/* Visual meter bar */}
              <div className="space-y-2 pt-1">
                <div className="relative h-3.5 w-full overflow-hidden rounded-full bg-muted border border-border/60">
                  <div
                    className={cn(
                      "h-full transition-all duration-500 rounded-full",
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

                <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                  <span className="text-rose-400">Refusal (&lt;{lowerThreshold})</span>
                  <span className="text-amber-400">Retry ({lowerThreshold}-{upperThreshold})</span>
                  <span className="text-emerald-400">Direct (&ge;{upperThreshold})</span>
                </div>
              </div>
            </div>

            {/* Evaluated Chunks with Score Breakdown & Expandable Text */}
            {evaluateStep?.data?.scored && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-xs font-semibold text-foreground">
                  <span className="flex items-center gap-1.5">
                    <BookOpen className="h-3.5 w-3.5 text-blue-400" />
                    <span>Graded Chunks ({evaluateStep.data.scored.length})</span>
                  </span>
                </div>

                <div className="space-y-2">
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
                        className="rounded-xl border border-border/80 bg-background/50 p-3 space-y-2 text-xs transition-all hover:border-border"
                      >
                        <div
                          className="flex items-center justify-between gap-2 cursor-pointer select-none"
                          onClick={() => setExpandedChunk(isExpanded ? null : idx)}
                        >
                          <code className="text-[11px] font-mono text-blue-400 font-semibold truncate max-w-[200px]">
                            {item.citation}
                          </code>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-foreground">
                              {Number(item.score).toFixed(3)}
                            </span>
                            {isExpanded ? (
                              <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                          </div>
                        </div>

                        {/* Similarity Bar */}
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
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
                          <div className="pt-2 border-t border-border/60 text-[11px] text-muted-foreground space-y-1 animate-in fade-in-50">
                            {matchingSource?.title && (
                              <div className="font-semibold text-foreground">
                                {matchingSource.title}
                              </div>
                            )}
                            <div className="prose-custom text-[11px] leading-relaxed bg-muted/40 p-2.5 rounded-lg border border-border/50">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {matchingSource?.text ||
                                  "Clause chunk text retrieved from SQLite BM25 + Jina reranking index."}
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
          <div className="relative pl-6 space-y-5 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-border">
            {trace.map((evt, idx) => (
              <div key={idx} className="relative space-y-1.5">
                {/* Node dot */}
                <div className="absolute -left-6 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-background border-2 border-blue-500 text-blue-500 shadow-xs">
                  <div className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold capitalize text-foreground flex items-center gap-1.5">
                    {evt.step}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    Step {idx + 1}
                  </span>
                </div>

                <div className="rounded-xl border border-border/70 bg-muted/30 p-2.5 text-xs text-muted-foreground">
                  {evt.step === "retrieve" && (
                    <div className="space-y-1">
                      <div>
                        Query: <strong className="text-foreground">"{evt.data.query}"</strong>
                      </div>
                      <div>
                        Retrieved <strong className="text-foreground">{evt.data.count}</strong> chunks
                      </div>
                    </div>
                  )}

                  {evt.step === "rewrite" && (
                    <div className="space-y-1">
                      <div className="text-[11px] text-muted-foreground">Original Question:</div>
                      <div className="italic text-muted-foreground">"{evt.data.original}"</div>
                      <div className="text-[11px] font-semibold text-foreground pt-1">
                        Rewritten Query:
                      </div>
                      <div className="font-mono text-[11px] text-blue-400 bg-background/80 p-1.5 rounded border border-border/60">
                        {evt.data.rewritten}
                      </div>
                    </div>
                  )}

                  {evt.step === "evaluate" && (
                    <div>
                      Scored{" "}
                      <strong className="text-foreground">
                        {evt.data.scored?.length || 0}
                      </strong>{" "}
                      chunks with Jina Reranker
                    </div>
                  )}

                  {evt.step === "refine" && (
                    <div>
                      Kept{" "}
                      <strong className="text-emerald-400">
                        {evt.data.kept_chunks}
                      </strong>{" "}
                      sentences across {evt.data.context_chars} characters
                    </div>
                  )}

                  {evt.step === "refuse" && (
                    <div className="text-rose-400 font-medium">
                      Refusal triggered: {evt.data.reason}
                    </div>
                  )}

                  {evt.step === "action" && (
                    <div>
                      CRAG Action:{" "}
                      <strong className="text-foreground uppercase">
                        {evt.data.action}
                      </strong>{" "}
                      (Score: {evt.data.top_score})
                    </div>
                  )}

                  {!["retrieve", "rewrite", "evaluate", "refine", "refuse", "action"].includes(
                    evt.step
                  ) && (
                    <pre className="text-[10px] whitespace-pre-wrap font-mono">
                      {JSON.stringify(evt.data, null, 2)}
                    </pre>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === "raw" && (
          <div className="rounded-xl border border-border bg-muted/50 p-3">
            <pre className="text-[11px] font-mono text-muted-foreground whitespace-pre-wrap overflow-x-auto">
              {JSON.stringify({ action, trace, citations, sources }, null, 2)}
            </pre>
          </div>
        )}
      </ScrollArea>
    </aside>
  )
}
