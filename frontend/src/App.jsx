import { useState } from 'react'
import Inspector from './Inspector'
import './index.css'

const DEMOS = [
  'What is an alarm notification?',
  'Which measurements are defined for RRC connection establishment?',
  'What is the capital of France?',
]

export default function App() {
  const [question, setQuestion] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function ask(q) {
    if (!q.trim()) return
    setLoading(true); setError(null); setResult(null)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: q }),
      })
      if (!res.ok) throw new Error(`Request failed (${res.status})`)
      setResult(await res.json())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="layout">
      <main>
        <h1>3GPP Standards Assistant</h1>
        <p className="sub">
          Answers grounded in 3GPP specs. Refuses when the specs do not cover the question.
        </p>

        <form onSubmit={(e) => { e.preventDefault(); ask(question) }}>
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask about alarms, KPIs, or management services…"
            aria-label="Question"
          />
          <button disabled={loading || !question.trim()}>
            {loading ? 'Thinking…' : 'Ask'}
          </button>
        </form>

        <div className="demos">
          {DEMOS.map((d) => (
            <button key={d} className="chip" onClick={() => { setQuestion(d); ask(d) }}>
              {d}
            </button>
          ))}
        </div>

        {error && <p className="error">{error}</p>}

        {result && (
          <article className={result.refused ? 'answer refused' : 'answer'}>
            <p>{result.answer}</p>
            {result.citations.length > 0 && (
              <footer>
                Sources: {result.citations.map((c) => <code key={c}>{c}</code>)}
              </footer>
            )}
          </article>
        )}
      </main>

      {result && <Inspector action={result.action} trace={result.trace} />}
    </div>
  )
}
