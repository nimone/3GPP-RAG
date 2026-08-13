const ACTION_COLOR = {
  correct: '#16a34a',
  ambiguous: '#d97706',
  incorrect: '#dc2626',
}

export default function Inspector({ action, trace }) {
  if (!trace?.length) return null
  const evaluate = trace.find((e) => e.step === 'evaluate')
  const decision = trace.find((e) => e.step === 'action')

  return (
    <aside className="inspector">
      <h2>Under the hood</h2>

      <div className="badge" style={{ background: ACTION_COLOR[action] }}>
        {action}
      </div>

      {decision && (
        <p className="thresholds">
          top score <strong>{decision.data.top_score}</strong>
          {' '}(refuse &lt; {decision.data.lower} &le; retry &lt; {decision.data.upper} &le; answer)
        </p>
      )}

      {evaluate && (
        <>
          <h3>Retrieved chunks graded</h3>
          <ul className="scores">
            {evaluate.data.scored.map((s) => (
              <li key={s.citation}>
                <span className="bar" style={{ width: `${s.score * 100}%` }} />
                <code>{s.citation}</code>
                <span className="num">{s.score.toFixed(3)}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <h3>Pipeline</h3>
      <ol className="steps">
        {trace.map((e, i) => (
          <li key={i}>
            <strong>{e.step}</strong>
            {e.step === 'rewrite' && <em> → "{e.data.rewritten}"</em>}
            {e.step === 'refine' && <em> → kept {e.data.kept_chunks} chunks</em>}
            {e.step === 'refuse' && <em> → {e.data.reason}</em>}
          </li>
        ))}
      </ol>
    </aside>
  )
}
