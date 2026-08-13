import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "eval"))
from run_eval import score_row
from threegpp_rag.generate import REFUSAL

def test_out_of_scope_refused_counts_as_correct():
    row = {"query": "capital of France", "expected": "REFUSE"}
    r = score_row(row, {"answer": REFUSAL, "refused": True, "citations": []})
    assert r["correct"] is True
    assert r["false_refusal"] is False

def test_out_of_scope_answered_is_a_hallucination():
    row = {"query": "capital of France", "expected": "REFUSE"}
    r = score_row(row, {"answer": "Paris.", "refused": False, "citations": []})
    assert r["correct"] is False
    assert r["hallucinated"] is True

def test_in_scope_refused_is_a_false_refusal():
    row = {"query": "what is an alarm", "expected": "notification"}
    r = score_row(row, {"answer": REFUSAL, "refused": True, "citations": []})
    assert r["correct"] is False
    assert r["false_refusal"] is True

def test_in_scope_answered_with_right_citation():
    row = {"query": "what is an alarm", "expected": "notification", "citation": "TS 28.111 §4.1"}
    r = score_row(row, {"answer": "An alarm is a notification. TS 28.111 §4.1",
                        "refused": False, "citations": ["TS 28.111 §4.1"]})
    assert r["correct"] is True
    assert r["citation_ok"] is True
