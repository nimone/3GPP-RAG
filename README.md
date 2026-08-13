# 3GPP RAG Chatbot

A retrieval-augmented generation chatbot over 3GPP telecom standards that cites clause-level sources and **refuses to answer** when retrieval confidence is below threshold.

## Architecture

```
Question
   │
   ▼
Hybrid Retrieval (pgvector cosine + tsvector BM25, fused by RRF)
   │
   ▼
Jina Reranker v2 (relevance score per chunk)
   │
   ├── score ≥ 0.55  → CORRECT ──► Knowledge Refinement ──► Gemini 3.5 Flash Lite (grounded answer)
   │                                                              │
   ├── 0.30 ≤ score  → AMBIGUOUS ─► Query Rewrite ──► Retrieve again (once)
   │   < 0.55                            │
   │                              still ambiguous
   │                                     │
   └── score < 0.30  → INCORRECT ──────► REFUSE
                                         │
                                  "Not found in the provided 3GPP specifications."
```

Every decision is recorded in a trace returned with the answer and rendered in the React inspector panel. The trace ships in the same JSON response rather than over SSE, which keeps the frontend a plain `fetch` and avoids streaming complications on Vercel.

## Evaluation Results

30-question golden set (20 in-scope, 10 out-of-scope). Evaluated 2026-08-13.

| Metric | Score | Notes |
|---|---|---|
| Answer accuracy (in-scope) | **90%** (18/20) | Keyword match in generated answer |
| Citation validity | 75% (15/20) | Expected citation in response |
| Refusal rate (out-of-scope) | **100%** (10/10) | All 10 off-topic questions refused |
| False-refusal rate | 10% (2/20) | Both residuals are OpenAPI-schema questions |
| Hallucination rate | **0%** (0/10) | No hallucinated answers on out-of-scope |

Reproduce with `uv run python eval/run_eval.py`; per-question output lands in `eval/results.json`.

**Thresholds:** `CRAG_UPPER=0.55`, `CRAG_LOWER=0.30`, `CRAG_KEEP=0.10`, `CRAG_TOP_K=12` — calibrated on this set, not chosen round.

The false-refusal rate started at 25% and two changes moved it to 10%:

1. **`CRAG_TOP_K` 8 → 12.** Tracing a refused-but-answerable question showed the gold clause (`TS 28.111 §6.12`) reranked 11th, just outside the old cutoff. The refusal was correct given the context the generator saw — the context was wrong. Refinement costs ~4s more per query at 12 chunks, so a query runs 10-14s against Vercel's 60s limit.
2. **Prompt loosened on synthesis.** The generator was refusing when the context held requirement rows and schema fields rather than a textbook definition. It now answers from whatever the context states. This does not weaken the refusal guarantee: out-of-scope questions are gated by the CRAG action before the model is called, and an empty context short-circuits to the refusal without a model call.

### CRAG vs vanilla RAG

`uv run python eval/rag_vs_crag.py` runs the same 30 questions through the full state machine and through a stripped pipeline — same retrieval, no grading, no gate, always answers.

**CRAG 28/30, vanilla RAG 28/30.** A tie, and reporting it honestly matters more than the headline would. On this corpus vanilla RAG also refuses the out-of-scope questions, because retrieval returns weakly related chunks and the grounding prompt alone is enough to reject them. The two pipelines diverge on only two questions, in opposite directions.

The value CRAG adds here is therefore not raw accuracy — it is that the refusal is a *structural* guarantee (a score below 0.30 never reaches the model) rather than a behaviour the prompt asks for and the model may or may not honour on a given day. The eval set would need adversarial in-corpus questions, where retrieval returns confidently wrong chunks, to separate the two on score.

### Citation validity

Citation validity is the weakest number. The 5 misses are OpenAPI-derived citations (`TS 28.532 §OpenAPI/HeartbeatNtf#HeartbeatNotification`), where the generator cites the clause but not the schema-path suffix.

## Hallucination Controls

| Control | Where |
|---|---|
| 1. Hybrid retrieval fuses two ranking signals | `retrieval.py` |
| 2. Cross-encoder reranks every candidate | `jina.py` (jina-reranker-v2-base-multilingual) |
| 3. Max-score action trigger (not mean) | `crag/action.py` |
| 4. Knowledge refinement strips irrelevant sentences | `crag/decompose.py` |
| 5. Hard refusal below lower threshold | `crag/graph.py` |
| 6. Mandatory citation rule in prompt | `generate.py` |
| 7. Inspector panel makes grading visible | `frontend/src/Inspector.jsx` |

## Why refuse instead of web fallback?

In a standards-compliance context, a plausible non-normative answer is worse than no answer.
The `incorrect` branch refuses outright — no web search, no hallucinated standards text.

## Corpus

| File | Spec | Description | Sections |
|---|---|---|---|
| `28111-j50.docx` | TS 28.111 | Fault management | 70 |
| `28532-k10.docx` | TS 28.532 | Management services | 194 |
| `28552-k30.docx` | TS 28.552 | KPIs | 820 |
| `data/raw/openapi/*.yaml` | All | OpenAPI schemas (7 files) | 101 |

Total: 1185 sections → 1679 chunks @ 1024-dim Jina embeddings (jina-embeddings-v3).

## Local Setup

```bash
# 1. Install
uv sync

# 2. Create .env (see .env.example)
cp .env.example .env
# fill in JINA_API_KEY, GEMINI_API_KEY, DB_URL

# 3. Apply schema to Neon
psql "$DB_URL" -f schema.sql

# 4. Ingest (takes ~10 minutes due to Jina free-tier rate limits)
uv run python -m threegpp_rag.ingest.run

# 5. Run backend
uv run uvicorn threegpp_rag.app:app --reload --port 8000

# 6. Run frontend (separate terminal)
cd frontend && npm install && npm run dev
# Open http://localhost:5173
```

## Testing

```bash
uv run pytest -v
```

## Limitations

- **Tier 1 corpus only**: 3 specs + 7 OpenAPI files. Drop more `.docx` into `data/raw/` and re-run ingestion.
- **Single retry**: Ambiguous queries get one rewrite and one re-retrieval, then refuse. Fits Vercel's 60s limit.
- **No conversation memory**: Each query is stateless.
- **Jina free tier**: Rate-limited; the backoff handler retries up to 6 times on both HTTP 429 and transport errors. Production usage benefits from a paid plan.
- **Sequential scan**: No HNSW index. Exact search is faster than index overhead at 1679 chunks; add one past ~50k rows.
