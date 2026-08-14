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
                        type("D", (), {"on_event": staticmethod(on_event) if on_event else None})())
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
    assert r.status_code == 200
    body = r.json()
    assert body["refused"] is True
    assert body["citations"] == []

def test_chat_rejects_empty_question(client):
    assert client.post("/api/chat", json={"question": "   "}).status_code == 422

def test_chat_stream_success(client, monkeypatch):
    import json
    monkeypatch.setattr(app_module, "answer_stream", lambda q, c: ["Chunk 1", " TS 28.111 §4.1"])
    r = client.post("/api/chat/stream", json={"question": "What is an alarm?"})
    assert r.status_code == 200
    lines = [line for line in r.text.split("\n") if line.startswith("data: ")]
    events = [json.loads(line[6:]) for line in lines]
    types = [e["type"] for e in events]
    assert "step" in types
    assert "meta" in types
    assert "delta" in types
    assert "done" in types
    meta = next(e for e in events if e["type"] == "meta")
    assert meta["refused"] is False
    assert len(meta["citations"]) > 0

def test_chat_stream_late_refusal_emits_corrective_meta(client, monkeypatch):
    import json
    # Simulate LLM emitting the exact REFUSAL string despite CRAG having found context
    monkeypatch.setattr(app_module, "answer_stream", lambda q, c: [app_module.REFUSAL])
    r = client.post("/api/chat/stream", json={"question": "What is an alarm?"})
    assert r.status_code == 200
    lines = [line for line in r.text.split("\n") if line.startswith("data: ")]
    events = [json.loads(line[6:]) for line in lines]
    # Should have initial meta, delta with REFUSAL, corrective meta, and done
    metas = [e for e in events if e["type"] == "meta"]
    assert len(metas) >= 2
    final_meta = metas[-1]
    assert final_meta["refused"] is True
    assert final_meta["citations"] == []
    assert final_meta["sources"] == []
    assert final_meta["action"] == "incorrect"


def test_spa_is_served_at_root():
    """The frontend must not fall through to the API's 404.

    Vercel runs the whole FastAPI app as one function receiving every path, so
    '/' is only a page if the app serves the build itself.
    """
    if not app_module.DIST.is_dir():
        pytest.skip("frontend/dist not built")
    r = TestClient(app_module.app).get("/")
    assert r.status_code == 200
    assert "text/html" in r.headers["content-type"]
