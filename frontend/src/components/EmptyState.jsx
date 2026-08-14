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
    desc: "Alarm notification definitions, supervision requirements, and AlarmRecord schemas.",
    query: "What is an alarm notification in 3GPP fault management?",
    icon: AlertTriangle,
    tag: "TS 28.111",
  },
  {
    title: "5G NR Performance KPIs",
    desc: "Standardized RRC connection establishment measurements and delay counters.",
    query: "Which measurements are defined for RRC connection establishment?",
    icon: Radio,
    tag: "TS 28.552",
  },
  {
    title: "Management Services Operations",
    desc: "Explore getMOIAttributes, HeartbeatNotification, and performance file conventions.",
    query: "What is the getMOIAttributes operation?",
    icon: FileText,
    tag: "TS 28.532",
  },
  {
    title: "Refusal Guardrail (Out of Domain)",
    desc: "Test guardrails with non-telecom out-of-domain questions.",
    query: "What is the capital of France?",
    icon: ShieldCheck,
    tag: "RAG Guardrail",
  },
]

export default function EmptyState({ onSelectPrompt }) {
  return (
    <div className="relative flex flex-1 flex-col items-center justify-center p-6 text-center max-w-3xl mx-auto my-auto animate-in fade-in duration-300">
      {/* Signature Atmospheric Mesh Gradient Backdrop */}
      <div
        className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-[600px] h-[340px] mesh-gradient-backdrop rounded-full blur-2xl opacity-80"
        aria-hidden="true"
      />

      {/* Hero Badge */}
      <div className="relative mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-elevation-2">
        <Bot className="h-6 w-6" aria-hidden="true" />
        <div
          className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-blue-500 text-white shadow-xs"
          aria-hidden="true"
        >
          <Sparkles className="h-2 w-2" />
        </div>
      </div>

      <h1 className="text-2xl sm:text-3xl font-semibold tracking-[-0.035em] text-foreground max-w-lg leading-tight">
        Grounded telecom intelligence for 3GPP standards.
      </h1>

      <p className="mt-2.5 text-sm text-muted-foreground max-w-lg leading-relaxed">
        Engineered with <strong>Grounded 3GPP RAG</strong> reasoning.
        Answers are verified against loaded 3GPP specifications (TS&nbsp;28.111, TS&nbsp;28.532, TS&nbsp;28.552) and strictly refused when out of domain.
      </p>

      {/* Suggested Prompt Cards */}
      <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3 w-full text-left" role="list">
        {FEATURED_PROMPTS.map((item, idx) => {
          const Icon = item.icon
          return (
            <button
              key={idx}
              type="button"
              onClick={() => onSelectPrompt(item.query)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  onSelectPrompt(item.query)
                }
              }}
              aria-label={`Ask: ${item.query}`}
              className="group relative flex flex-col justify-between rounded-lg border border-border bg-card/80 hover:bg-card p-4 transition-colors duration-150 shadow-elevation-1 hover:shadow-elevation-2 cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-muted text-foreground border border-border/60">
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                </div>
                <span className="text-[10px] font-mono font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded border border-border/50">
                  {item.tag}
                </span>
              </div>

              <div className="mt-3">
                <div className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors flex items-center justify-between">
                  <span>{item.title}</span>
                  <ArrowRight
                    className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-transform"
                    aria-hidden="true"
                  />
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground line-clamp-2 leading-normal">
                  {item.desc}
                </p>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
