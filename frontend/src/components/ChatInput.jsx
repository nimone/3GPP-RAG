import React, { useRef, useEffect } from "react"
import { ArrowUp, CornerDownLeft, Sparkles, StopCircle } from "lucide-react"
import { Button } from "@/components/ui/button"

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
        <div className="mb-2.5 flex flex-wrap gap-1.5 justify-center" role="list" aria-label="Suggested follow-up queries">
          {suggestions.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onSelectSuggestion(s)}
              aria-label={`Ask suggestion: ${s}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/80 hover:bg-card px-3 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors duration-150 shadow-elevation-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
            >
              <Sparkles className="h-3 w-3 text-blue-500 shrink-0" aria-hidden="true" />
              <span className="truncate max-w-[240px] sm:max-w-xs">{s}</span>
            </button>
          ))}
        </div>
      )}

      {/* Main Input Box Form */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (input.trim() && !loading) {
            onSubmit(input)
          }
        }}
        className="relative flex flex-col rounded-xl border border-border bg-card shadow-elevation-2 transition-colors duration-150 focus-within:border-foreground/40 focus-within:ring-1 focus-within:ring-foreground/20"
      >
        <label htmlFor="chat-input-textarea" className="sr-only">
          Ask a question about 3GPP standards specifications
        </label>
        <textarea
          id="chat-input-textarea"
          name="prompt"
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything about 3GPP specs (e.g. Alarms in TS 28.532, KPIs in TS 28.552)…"
          disabled={loading}
          autoComplete="off"
          spellCheck={false}
          rows={1}
          className="w-full resize-none bg-transparent px-4 pt-3.5 pb-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none disabled:opacity-50 min-h-[46px] max-h-[180px]"
        />

        <div className="flex items-center justify-between px-3 pb-2.5 pt-1">
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="hidden sm:inline">Press</span>
            <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              <CornerDownLeft className="h-2.5 w-2.5" aria-hidden="true" /> Enter
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
                aria-label="Cancel active generation"
                title="Cancel request"
              >
                <StopCircle className="h-4 w-4" aria-hidden="true" />
              </Button>
            ) : (
              <Button
                type="submit"
                size="iconSm"
                disabled={!input.trim() || loading}
                aria-label="Send query"
                className="h-8 w-8 rounded-full bg-primary text-primary-foreground transition-transform active:scale-95 disabled:opacity-30 disabled:scale-100"
              >
                <ArrowUp className="h-4 w-4" aria-hidden="true" />
              </Button>
            )}
          </div>
        </div>
      </form>

      {/* Helper Context Subtitle */}
      <div className="mt-2 text-center text-[10px] text-muted-foreground/60 font-mono select-none">
        Grounded 3GPP RAG pipeline. Verifies specification context before answering.
      </div>
    </div>
  )
}
