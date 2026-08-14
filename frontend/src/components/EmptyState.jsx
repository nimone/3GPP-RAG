import React from "react"
import {
  Sparkles,
  AlertTriangle,
  Radio,
  FileText,
  ShieldCheck,
  ArrowRight,
  Bot,
} from "lucide-react"

const FEATURED_PROMPTS = [
  {
    title: "Fault Management & Alarms",
    desc: "Inquire about alarm notification definitions, supervision requirements, and AlarmRecord schemas.",
    query: "What is an alarm notification in 3GPP fault management?",
    icon: AlertTriangle,
    tag: "TS 28.111",
  },
  {
    title: "5G NR Performance KPIs",
    desc: "Explore standardized RRC connection establishment measurements and delay counters.",
    query: "Which measurements are defined for RRC connection establishment?",
    icon: Radio,
    tag: "TS 28.552",
  },
  {
    title: "Management Services Operations",
    desc: "Understand getMOIAttributes, HeartbeatNotification, and performance file conventions.",
    query: "What is the getMOIAttributes operation?",
    icon: FileText,
    tag: "TS 28.532",
  },
  {
    title: "Safety & Scope Guardrail",
    desc: "Verify that the assistant strictly refuses out-of-domain questions to avoid hallucination.",
    query: "What is the capital of France?",
    icon: ShieldCheck,
    tag: "CRAG Guardrail",
  },
]

export default function EmptyState({ onSelectPrompt }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-6 text-center max-w-3xl mx-auto my-auto animate-in fade-in-50 duration-500">
      {/* Hero Badge */}
      <div className="relative mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 text-white shadow-xl shadow-blue-500/25 ring-8 ring-blue-500/10">
        <Bot className="h-7 w-7" />
        <div className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white">
          <Sparkles className="h-2.5 w-2.5" />
        </div>
      </div>

      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
        What 3GPP spec can I help you with today?
      </h1>
      <p className="mt-2 text-sm text-muted-foreground max-w-lg leading-relaxed">
        Grounded telecom intelligence powered by <strong>Corrective RAG (CRAG)</strong>.
        Answers are verified against loaded 3GPP specifications (TS 28.111, TS 28.532, TS 28.552) and refused when out of domain.
      </p>

      {/* Suggested Prompt Cards */}
      <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3 w-full text-left">
        {FEATURED_PROMPTS.map((item, idx) => {
          const Icon = item.icon
          return (
            <div
              key={idx}
              onClick={() => onSelectPrompt(item.query)}
              className="group relative flex flex-col justify-between rounded-xl border border-border/80 bg-card/60 hover:bg-card p-4 transition-all duration-200 hover:shadow-md hover:border-primary/40 cursor-pointer text-left"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-4 w-4" />
                </div>
                <span className="text-[10px] font-mono font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                  {item.tag}
                </span>
              </div>

              <div className="mt-3">
                <div className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors flex items-center gap-1">
                  <span>{item.title}</span>
                  <ArrowRight className="h-3 w-3 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground line-clamp-2">
                  {item.desc}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
