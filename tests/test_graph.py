from threegpp_rag.crag.graph import CragDeps, run_crag
from threegpp_rag.types import Chunk

def _chunks(*texts):
    return [Chunk(id=str(i), text=t, spec="TS 28.111", clause="4.1", title="Alarms")
            for i, t in enumerate(texts)]

def _deps(scorer, retriever=None, **kw):
    return CragDeps(
        retriever=retriever or (lambda q: _chunks("An alarm was raised. Sky is blue.")),
        scorer=scorer,
        rewriter=lambda q: q + " rewritten",
        upper=kw.get("upper", 0.55), lower=kw.get("lower", 0.30), keep=kw.get("keep", 0.25),
    )

def test_high_score_answers_without_retry():
    state = run_crag("alarms", _deps(lambda q, d: [0.9] * len(d)))
    assert state["action"] == "correct"
    assert state["refused"] is False
    assert state["retries"] == 0
    assert "alarm" in state["context"]

def test_low_score_refuses_without_calling_generator():
    state = run_crag("weather", _deps(lambda q, d: [0.05] * len(d)))
    assert state["action"] == "incorrect"
    assert state["refused"] is True
    assert state["context"] == ""

def test_mid_score_retries_once_then_refuses():
    calls = {"n": 0}
    def retriever(q):
        calls["n"] += 1
        return _chunks("Marginal content.")
    state = run_crag("x", _deps(lambda q, d: [0.40] * len(d), retriever=retriever))
    assert calls["n"] == 2
    assert state["retries"] == 1
    assert state["refused"] is True

def test_retry_that_improves_produces_an_answer():
    calls = {"n": 0}
    def retriever(q):
        calls["n"] += 1
        return _chunks("Marginal." if calls["n"] == 1 else "An alarm was raised.")
    def scorer(q, docs):
        return [0.9 if "alarm" in d else 0.40 for d in docs]
    state = run_crag("alarms", _deps(scorer, retriever=retriever))
    assert state["retries"] == 1
    assert state["action"] == "correct"
    assert state["refused"] is False

def test_trace_records_each_step():
    events = []
    deps = _deps(lambda q, d: [0.9] * len(d))
    deps.on_event = lambda e: events.append(e.step)
    run_crag("alarms", deps)
    assert events[:3] == ["retrieve", "evaluate", "action"]
