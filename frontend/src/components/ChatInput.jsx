import React, { useRef, useEffect } from "react"
import { ArrowUp, CornerDownLeft, Sparkles, StopCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export default function ChatInput({
  input,
  setInput,
  onSubmit,
  loading,
  onStop,
  suggestions = [],
  onSelectSuggestion,
}) {
  const textareaRef = useRef(null)

  // Auto-grow textarea height
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
      textareaRef.current.style.height = `${Math.min(
        textareaRef.current.scrollHeight,
        180
      )}px`
    }
  }, [input])

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      if (input.trim() && !loading) {
        onSubmit(input)
      }
    }
  }

  return (
    <div className="w-full max-w-3xl mx-auto px-4 pb-4 sm:pb-6">
      {/* Suggestions Chips (shown if provided) */}
      {suggestions.length > 0 && (
        <div className="mb-2.5 flex flex-wrap gap-1.5 justify-center">
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => onSelectSuggestion(s)}
              className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-card/60 hover:bg-card px-3 py-1 text-xs text-muted-foreground hover:text-foreground transition-all duration-150 backdrop-blur-xs shadow-xs"
            >
              <Sparkles className="h-3 w-3 text-blue-400" />
              <span className="truncate max-w-[240px] sm:max-w-xs">{s}</span>
            </button>
          ))}
        </div>
      )}

      {/* Main Input Box */}
      <div className="relative flex flex-col rounded-2xl border border-border bg-card/90 shadow-lg shadow-black/5 dark:shadow-black/40 backdrop-blur-md transition-all duration-200 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything about 3GPP specs (Alarms TS 28.532, KPIs TS 28.552, etc.)..."
          disabled={loading}
          rows={1}
          className="w-full resize-none bg-transparent px-4 pt-3.5 pb-2 text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none disabled:opacity-50 min-h-[46px] max-h-[180px]"
        />

        <div className="flex items-center justify-between px-3 pb-2.5 pt-1">
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="hidden sm:inline">Press</span>
            <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              <CornerDownLeft className="h-2.5 w-2.5" /> Enter
            </kbd>
            <span className="hidden sm:inline">to submit</span>
          </div>

          <div className="flex items-center gap-2">
            {loading ? (
              <Button
                type="button"
                size="iconSm"
                variant="destructive"
                className="h-8 w-8 rounded-full"
                onClick={onStop}
                title="Cancel request"
              >
                <StopCircle className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                type="button"
                size="iconSm"
                disabled={!input.trim() || loading}
                onClick={() => onSubmit(input)}
                className="h-8 w-8 rounded-full bg-primary text-primary-foreground transition-transform active:scale-95 disabled:opacity-30 disabled:scale-100"
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="mt-2 text-center text-[11px] text-muted-foreground">
        Grounded RAG with Corrective RAG (CRAG) graph. Verifies specs before answering.
      </div>
    </div>
  )
}
