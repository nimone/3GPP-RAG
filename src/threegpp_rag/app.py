import json
import queue
import threading
from dataclasses import asdict
from pathlib import Path
from typing import Iterator
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, field_validator
from threegpp_rag.crag.graph import deps_from_env, run_crag
from threegpp_rag.db import query
from threegpp_rag.generate import REFUSAL, answer, answer_stream, check_model
from threegpp_rag.types import TraceEvent

app = FastAPI(title="3GPP RAG Chatbot")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)

class ChatRequest(BaseModel):
    question: str

    @field_validator("question")
    @classmethod
    def not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("question must not be empty")
        return v.strip()

@app.get("/api/health")
def health() -> dict:
    try:
        rows = query("select count(*) as n from chunks")
        chunks = rows[0]["n"] if rows else 0
        db_ok = True
    except Exception as e:
        chunks, db_ok = 0, False
        print(f"health: db error {e}")
    try:
        model_ok = check_model()
    except Exception as e:
        model_ok = False
        print(f"health: model error {e}")
    return {
        "status": "ok" if db_ok and model_ok else "degraded",
        "db_ok": db_ok,
        "model_ok": model_ok,
        "chunks": chunks,
    }

@app.post("/api/chat")
def chat(req: ChatRequest) -> dict:
    events: list[TraceEvent] = []
    deps = deps_from_env(on_event=events.append)
    state = run_crag(req.question, deps)
    text = answer(req.question, state["context"])
    chunks = state.get("chunks", [])
    refused = state["refused"] or (REFUSAL in text)
    citations = sorted({c.citation for c in chunks}) if not refused else []
    sources = [
        {
            "id": getattr(c, "id", str(i)),
            "citation": c.citation,
            "spec": getattr(c, "spec", ""),
            "clause": getattr(c, "clause", ""),
            "title": getattr(c, "title", ""),
            "text": getattr(c, "text", ""),
        }
        for i, c in enumerate(chunks)
    ] if not refused else []

    return {
        "answer": text,
        "action": state["action"],
        "refused": refused,
        "citations": citations,
        "sources": sources,
        "trace": [asdict(e) for e in events],
    }

@app.post("/api/chat/stream")
def chat_stream(req: ChatRequest):
    def event_generator() -> Iterator[str]:
        q: queue.Queue = queue.Queue()
        events: list[TraceEvent] = []

        def on_event(*args):
            ev = args[-1] if args else None
            if ev and isinstance(ev, TraceEvent):
                events.append(ev)
                q.put(("step", asdict(ev)))

        def worker():
            try:
                deps = deps_from_env(on_event=on_event)
                state = run_crag(req.question, deps)
                q.put(("state", state))
            except Exception as e:
                q.put(("error", str(e)))

        t = threading.Thread(target=worker)
        t.start()

        state = None
        while True:
            try:
                msg_type, payload = q.get(timeout=0.05)
                if msg_type == "step":
                    yield f"data: {json.dumps({'type': 'step', 'step': payload['step'], 'data': payload['data']})}\n\n"
                elif msg_type == "state":
                    state = payload
                    break
                elif msg_type == "error":
                    yield f"data: {json.dumps({'type': 'error', 'error': payload})}\n\n"
                    return
            except queue.Empty:
                if not t.is_alive() and q.empty():
                    break
                continue

        t.join()
        if not state:
            return

        chunks = state.get("chunks", [])
        if state.get("refused", False):
            meta_payload = {
                "type": "meta",
                "action": state.get("action", "incorrect"),
                "refused": True,
                "citations": [],
                "sources": [],
                "trace": [asdict(e) for e in events],
            }
            yield f"data: {json.dumps(meta_payload)}\n\n"
            yield f"data: {json.dumps({'type': 'delta', 'text': REFUSAL})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
            return

        citations = sorted({c.citation for c in chunks})
        sources = [
            {
                "id": getattr(c, "id", str(i)),
                "citation": c.citation,
                "spec": getattr(c, "spec", ""),
                "clause": getattr(c, "clause", ""),
                "title": getattr(c, "title", ""),
                "text": getattr(c, "text", ""),
            }
            for i, c in enumerate(chunks)
        ]

        meta_payload = {
            "type": "meta",
            "action": state["action"],
            "refused": False,
            "citations": citations,
            "sources": sources,
            "trace": [asdict(e) for e in events],
        }
        yield f"data: {json.dumps(meta_payload)}\n\n"

        accumulated_text = ""
        for token in answer_stream(req.question, state["context"]):
            if token:
                accumulated_text += token
                yield f"data: {json.dumps({'type': 'delta', 'text': token})}\n\n"

        # If model emitted the refusal string despite non-empty context, emit corrective meta to blank citations
        if (REFUSAL in accumulated_text) or state.get("refused", False):
            corrective_meta = {
                "type": "meta",
                "action": "incorrect",
                "refused": True,
                "citations": [],
                "sources": [],
                "trace": [asdict(e) for e in events],
            }
            yield f"data: {json.dumps(corrective_meta)}\n\n"

        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )

# Serve the built SPA as low-priority routes: the API paths above are matched
# first, anything else falls back to index.html. Vercel deploys a FastAPI app as
# one function that receives every path, so the frontend has to be served from
# here rather than from a separate static output directory.
DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if DIST.is_dir():
    app.frontend("/", directory=DIST)
