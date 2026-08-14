import React, { useState } from "react"
import {
  Search,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Brain,
  Layers,
  Filter,
  FileCheck,
  ShieldCheck,
  RefreshCw,
  Loader2,
} from "lucide-react"
import { cn } from "@/lib/utils"

export default function ReasoningProcess({
  trace = [],
  action: _action,
  isStreaming,
  currentStep,
  refused,
  hasContent = false,
}) {
  const [userOverride, setUserOverride] = useState(null)

  // Default state: open while performing RAG lookup before content streams; automatically collapse once content starts
  const autoOpen = isStreaming && !hasContent
  const isOpen = userOverride !== null ? userOverride : autoOpen

  // Step definition mapping
  const stepsList = []

  const retrieveEvt = trace.find((t) => t.step === "retrieve")
  const rewriteEvt = trace.find((t) => t.step === "rewrite")
  const evaluateEvt = trace.find((t) => t.step === "evaluate")
  const refineEvt = trace.find((t) => t.step === "refine")
  const actionEvt = trace.find((t) => t.step === "action")
  const refuseEvt = trace.find((t) => t.step === "refuse")

  if (retrieveEvt) {
    stepsList.push({
      id: "retrieve",
      title: "Searching 3GPP Specifications",
      desc: retrieveEvt.data.query
        ? `Queried index for "${retrieveEvt.data.query}" — retrieved ${retrieveEvt.data.count || 0} candidate clauses`
        : "Looking up candidate standard clauses in TS 28.111, TS 28.532, TS 28.552…",
      icon: Search,
      done: true,
      data: retrieveEvt.data,
    })
  } else if (isStreaming && (!currentStep || currentStep === "retrieve")) {
    stepsList.push({
      id: "retrieve",
      title: "Searching 3GPP Specifications",
      desc: "Querying BM25 index across 3GPP Technical Specifications…",
      icon: Search,
      active: true,
    })
  }

  if (evaluateEvt) {
    const topScored = evaluateEvt.data.scored?.[0]
    stepsList.push({
      id: "evaluate",
      title: "Reranking & Evaluating Relevance",
      desc: topScored
        ? `Scored ${evaluateEvt.data.scored.length} chunks via Jina Reranker v2 (Top score: ${Number(topScored.score).toFixed(3)} for ${topScored.citation})`
        : "Reranking candidates with cross-encoder relevance scoring…",
      icon: Layers,
      done: true,
      data: evaluateEvt.data,
    })
  } else if (isStreaming && currentStep === "evaluate") {
    stepsList.push({
      id: "evaluate",
      title: "Reranking & Evaluating Relevance",
      desc: "Cross-encoding query and candidate chunks with Jina AI Reranker…",
      icon: Layers,
      active: true,
    })
  }

  if (rewriteEvt) {
    stepsList.push({
      id: "rewrite",
      title: "Query Reformulation (Ambiguous Context)",
      desc: `Reformulated keyword query for spec alignment: "${rewriteEvt.data.rewritten}"`,
      icon: RefreshCw,
      done: true,
      data: rewriteEvt.data,
    })
  }

  if (refineEvt) {
    stepsList.push({
      id: "refine",
      title: "Context Refinement & Noise Filtering",
      desc: `Extracted ${refineEvt.data.kept_chunks || 0} gold clauses (${refineEvt.data.context_chars || 0} characters) matching question scope`,
      icon: Filter,
      done: true,
      data: refineEvt.data,
    })
  } else if (isStreaming && currentStep === "refine") {
    stepsList.push({
      id: "refine",
      title: "Context Refinement & Noise Filtering",
      desc: "Decomposing clauses into atomic sentences and retaining verified evidence…",
      icon: Filter,
      active: true,
    })
  }

  if (actionEvt || isStreaming) {
    if (refuseEvt || refused) {
      stepsList.push({
        id: "formulate",
        title: "Applying Safety Guardrail",
        desc: "Relevance score fell below threshold — safely returning standard domain refusal.",
        icon: ShieldCheck,
        done: true,
      })
    } else {
      stepsList.push({
        id: "formulate",
        title: isStreaming ? "Formulating Grounded Response" : "Synthesized Grounded Response",
        desc: isStreaming
          ? "Generating authoritative answer with strict bracketed spec citations…"
          : "Verified facts against loaded 3GPP specifications with citations.",
        icon: FileCheck,
        active: isStreaming && !stepsList.some((s) => s.active),
        done: !isStreaming,
      })
    }
  }

  // Active step label for collapsed header
  const activeStepItem = stepsList.find((s) => s.active)
  const headerText = isStreaming
    ? activeStepItem?.title || "Reasoning through 3GPP specs…"
    : `Reasoning complete · ${stepsList.length} steps`

  return (
    <div className="mb-3 rounded-lg border border-border/80 bg-muted/20 overflow-hidden text-xs transition-colors duration-150">
      {/* Header Button */}
      <button
        type="button"
        onClick={() => setUserOverride(!isOpen)}
        aria-expanded={isOpen}
        aria-label="Toggle reasoning process"
        className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-muted/40 transition-colors duration-150 cursor-pointer select-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <div className="flex items-center gap-2">
          {isStreaming ? (
            <div className="relative flex h-4 w-4 items-center justify-center" aria-hidden="true">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-foreground" />
            </div>
          ) : (
            <Brain className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          )}

          <span
            className={cn(
              "font-medium text-xs tracking-tight",
              isStreaming ? "shimmer-text font-semibold" : "text-muted-foreground"
            )}
          >
            {headerText}
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-muted-foreground">
          <span className="text-[10px] font-mono">
            {isOpen ? "Hide process" : "Show process"}
          </span>
          {isOpen ? (
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          )}
        </div>
      </button>

      {/* Expanded Reasoning Step List */}
      {isOpen && (
        <div className="px-3 pb-3 pt-1 border-t border-border/50 space-y-2 animate-in fade-in duration-150">
          {stepsList.map((step, idx) => {
            const StepIcon = step.icon
            return (
              <div
                key={step.id || idx}
                className={cn(
                  "relative flex items-start gap-2.5 rounded-md p-2 transition-colors duration-150",
                  step.active
                    ? "bg-card border border-border shadow-elevation-1"
                    : "bg-transparent text-muted-foreground"
                )}
              >
                <div
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded mt-0.5",
                    step.active
                      ? "bg-foreground text-background"
                      : step.done
                      ? "text-emerald-500 bg-emerald-500/10"
                      : "text-muted-foreground bg-muted"
                  )}
                  aria-hidden="true"
                >
                  {step.active ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : step.done ? (
                    <CheckCircle2 className="h-3 w-3" />
                  ) : (
                    <StepIcon className="h-3 w-3" />
                  )}
                </div>

                <div className="flex-1 min-w-0 space-y-0.5">
                  <div
                    className={cn(
                      "font-medium text-[11px] flex items-center justify-between gap-2",
                      step.active ? "text-foreground font-semibold" : "text-foreground/90"
                    )}
                  >
                    <span className={step.active ? "shimmer-text" : ""}>
                      {step.title}
                    </span>
                    <span className="text-[9px] font-mono text-muted-foreground uppercase">
                      {step.active ? "In progress" : "Verified"}
                    </span>
                  </div>

                  <p className="text-[11px] text-muted-foreground leading-normal">
                    {step.desc}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
