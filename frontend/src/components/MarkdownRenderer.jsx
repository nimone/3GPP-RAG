import React from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import CitationBadge from "./CitationBadge"

// Matches [TS 28.552 §5.1.1.15.2], [TS 28.111 §OpenAPI/FaultNrm#AlarmRecord], TS 28.111 §4.1, etc.
const CITATION_REGEX = /(\[TS\s+\d+(?:\.\d+)?(?:\s*(?:§|clause|\/|#)[^\]]+)?\]|TS\s+\d+(?:\.\d+)?\s*(?:§|clause)\s*[\w./#-]+)/gi

export function renderTextWithCitations(text, sources = [], onSelectSource) {
  if (typeof text !== "string") return text

  const parts = text.split(CITATION_REGEX)
  if (parts.length === 1) return text

  return parts.map((part, index) => {
    if (part.match(CITATION_REGEX)) {
      return (
        <CitationBadge
          key={index}
          citation={part}
          sources={sources}
          onSelectSource={onSelectSource}
          compact={true}
        />
      )
    }
    return part
  })
}

export default function MarkdownRenderer({ content, sources = [], onSelectSource }) {
  const components = {
    // Custom paragraph to parse citations inside text
    p: ({ children }) => {
      const parsedChildren = React.Children.map(children, (child) => {
        if (typeof child === "string") {
          return renderTextWithCitations(child, sources, onSelectSource)
        }
        return child
      })
      return <p>{parsedChildren}</p>
    },
    // Custom list item to parse citations inside li
    li: ({ children }) => {
      const parsedChildren = React.Children.map(children, (child) => {
        if (typeof child === "string") {
          return renderTextWithCitations(child, sources, onSelectSource)
        }
        return child
      })
      return <li>{parsedChildren}</li>
    },
    // Custom strong/bold to parse citations
    strong: ({ children }) => {
      const parsedChildren = React.Children.map(children, (child) => {
        if (typeof child === "string") {
          return renderTextWithCitations(child, sources, onSelectSource)
        }
        return child
      })
      return <strong>{parsedChildren}</strong>
    },
  }

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {content}
    </ReactMarkdown>
  )
}
