from dataclasses import dataclass, field
from typing import Callable, TypedDict
from langgraph.graph import END, START, StateGraph
from threegpp_rag.config import get_settings
from threegpp_rag.crag.action import decide_action
from threegpp_rag.crag.decompose import recompose
from threegpp_rag.types import Chunk, CragAction, TraceEvent

MAX_RETRIES = 1   # bounded to fit Vercel's 60s function limit

class CragState(TypedDict, total=False):
    question: str
    search_query: str
    chunks: list[Chunk]
    scores: list[float]
    action: CragAction
    context: str
    retries: int
    refused: bool
    trace: list[TraceEvent]

@dataclass
class CragDeps:
    retriever: Callable[[str], list[Chunk]]
    scorer: Callable[[str, list[str]], list[float]]
    rewriter: Callable[[str], str]
    upper: float
    lower: float
    keep: float
    on_event: Callable[[TraceEvent], None] | None = field(default=None)

def build_graph(deps: CragDeps):
    def emit(state: CragState, step: str, **data) -> None:
        ev = TraceEvent(step=step, data=data)
        state.setdefault("trace", []).append(ev)
        if deps.on_event:
            deps.on_event(ev)

    def retrieve_node(state: CragState) -> CragState:
        q = state.get("search_query") or state["question"]
        chunks = deps.retriever(q)
        emit(state, "retrieve", query=q, count=len(chunks),
             citations=[c.citation for c in chunks])
        return {"chunks": chunks, "search_query": q}

    def evaluate_node(state: CragState) -> CragState:
        chunks = state["chunks"]
        scores = deps.scorer(state["question"], [c.text for c in chunks]) if chunks else []
        emit(state, "evaluate",
             scored=[{"citation": c.citation, "score": round(s, 3)}
                     for c, s in zip(chunks, scores)])
        action = decide_action(scores, deps.upper, deps.lower)
        emit(state, "action", action=action,
             top_score=round(max(scores), 3) if scores else 0.0,
             upper=deps.upper, lower=deps.lower)
        return {"scores": scores, "action": action}

    def refine_node(state: CragState) -> CragState:
        """Keep only relevant sentences from each retrieved chunk."""
        parts = []
        for chunk, score in zip(state["chunks"], state["scores"]):
            if score < deps.lower:
                continue
            kept = recompose(state["question"], chunk.text, deps.scorer, deps.keep)
            if kept:
                parts.append(f"[{chunk.citation}] {kept}")
        context = "\n\n".join(parts)
        emit(state, "refine", kept_chunks=len(parts), context_chars=len(context))
        return {"context": context, "refused": not context}

    def rewrite_node(state: CragState) -> CragState:
        new_q = deps.rewriter(state["question"])
        emit(state, "rewrite", original=state["question"], rewritten=new_q)
        return {"search_query": new_q, "retries": state.get("retries", 0) + 1}

    def refuse_node(state: CragState) -> CragState:
        emit(state, "refuse", reason=f"top score below {deps.lower}")
        return {"context": "", "refused": True}

    def route(state: CragState) -> str:
        action = state["action"]
        if action == "correct":
            return "refine"
        if action == "incorrect":
            return "refuse"
        # ambiguous: one retry, then refuse rather than answer on weak evidence
        return "rewrite" if state.get("retries", 0) < MAX_RETRIES else "refuse"

    g = StateGraph(CragState)
    g.add_node("retrieve", retrieve_node)
    g.add_node("evaluate", evaluate_node)
    g.add_node("refine", refine_node)
    g.add_node("rewrite", rewrite_node)
    g.add_node("refuse", refuse_node)

    g.add_edge(START, "retrieve")
    g.add_edge("retrieve", "evaluate")
    g.add_conditional_edges("evaluate", route,
                            {"refine": "refine", "rewrite": "rewrite", "refuse": "refuse"})
    g.add_edge("rewrite", "retrieve")
    g.add_edge("refine", END)
    g.add_edge("refuse", END)
    return g.compile()

def run_crag(question: str, deps: CragDeps) -> CragState:
    initial: CragState = {"question": question, "retries": 0, "refused": False,
                          "context": "", "trace": []}
    return build_graph(deps).invoke(initial)

def deps_from_env(on_event=None) -> CragDeps:
    from threegpp_rag.generate import rewrite_query
    from threegpp_rag.jina import rerank
    from threegpp_rag.retrieval import retrieve
    s = get_settings()
    return CragDeps(retriever=retrieve, scorer=rerank, rewriter=rewrite_query,
                    upper=s.upper_threshold, lower=s.lower_threshold,
                    keep=s.keep_threshold, on_event=on_event)
