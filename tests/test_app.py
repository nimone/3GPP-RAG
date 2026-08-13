import pytest
from fastapi.testclient import TestClient
from threegpp_rag import app as app_module
from threegpp_rag.types import Chunk, TraceEvent

@pytest.fixture
def client(monkeypatch):
    def fake_run_crag(question, deps):
        for step in ("retrieve", "evaluate", "action"):
            if deps.on_event:
                deps.on_event(TraceEvent(step=step, data={}))
        refused = "france" in question.lower()
        return {
            "action": "incorrect" if refused else "correct",
            "context": "" if refused else "[TS 28.111 §4.1] An alarm is a notification.",
            "refused": refused,
            "chunks": [] if refused else [Chunk("1", "t", "TS 28.111", "4.1", "Alarms")],
            "trace": [],
        }
    monkeypatch.setattr(app_module, "run_crag", fake_run_crag)
    monkeypatch.setattr(app_module, "deps_from_env", lambda on_event=None:
                        type("D", (), {"on_event": on_event})())
    monkeypatch.setattr(app_module, "answer", lambda q, c: "An alarm is a notification. TS 28.111 §4.1")
    return TestClient(app_module.app)

def test_health_reports_status(client, monkeypatch):
    monkeypatch.setattr(app_module, "check_model", lambda: True)
    monkeypatch.setattr(app_module, "query", lambda sql, params=(): [{"n": 42}])
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["chunks"] == 42
    assert r.json()["model_ok"] is True

def test_chat_returns_answer_with_citations_and_trace(client):
    r = client.post("/api/chat", json={"question": "What is an alarm?"})
    assert r.status_code == 200
    body = r.json()
    assert body["refused"] is False
    assert body["action"] == "correct"
    assert "TS 28.111 §4.1" in body["answer"]
    assert [e["step"] for e in body["trace"]] == ["retrieve", "evaluate", "action"]

def test_chat_refuses_out_of_scope(client):
    r = client.post("/api/chat", json={"question": "What is the capital of France?"})
    body = r.json()
    assert body["refused"] is True
    assert body["citations"] == []

def test_chat_rejects_empty_question(client):
    assert client.post("/api/chat", json={"question": "   "}).status_code == 422
