from dataclasses import asdict
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, field_validator
from threegpp_rag.crag.graph import deps_from_env, run_crag
from threegpp_rag.db import query
from threegpp_rag.generate import answer, check_model
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
    return {"status": "ok" if db_ok and model_ok else "degraded",
            "db_ok": db_ok, "model_ok": model_ok, "chunks": chunks}

@app.post("/api/chat")
def chat(req: ChatRequest) -> dict:
    events: list[TraceEvent] = []
    deps = deps_from_env(on_event=events.append)
    state = run_crag(req.question, deps)
    text = answer(req.question, state["context"])
    citations = sorted({c.citation for c in state.get("chunks", [])}) \
        if not state["refused"] else []
    return {
        "answer": text,
        "action": state["action"],
        "refused": state["refused"],
        "citations": citations,
        "trace": [asdict(e) for e in events],
    }
