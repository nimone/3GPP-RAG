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
Cohere Reranker (relevance score per chunk)
   │
   ├── score ≥ 0.55  → CORRECT ──► Knowledge Refinement ──► Gemini (grounded answer)
   │                                                              │
   ├── 0.30 ≤ score  → AMBIGUOUS ─► Query Rewrite ──► Retrieve again (once)
   │   < 0.55                            │
   │                              still ambiguous
   │                                     │
   └── score < 0.30  → INCORRECT ──────► REFUSE
                                         │
                                  "Not found in the provided 3GPP specifications."
```

Every decision is recorded in a trace that streams to the React inspector panel.

## Evaluation Results

| Metric | Score |
|---|---|
| Answer accuracy (in-scope, 20 questions) | TBD after eval run |
| Citation validity | TBD |
| Refusal rate (out-of-scope, 10 questions) | TBD |
| False-refusal rate | TBD |
| Hallucination rate | TBD |

*Thresholds calibrated on eval set: CRAG_UPPER=0.55, CRAG_LOWER=0.30, CRAG_KEEP=0.25*

## Hallucination Controls

| Control | Where |
|---|---|
| 1. Hybrid retrieval fuses two ranking signals | `retrieval.py` |
| 2. Cross-encoder reranks every candidate | `jina.py` (Cohere reranker) |
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

Total: 1185 sections → 1679 chunks @ 1024-dim Cohere embeddings.

## Local Setup

```bash
# 1. Install
uv sync

# 2. Create .env (see .env.example)
cp .env.example .env
# fill in COHERE_API_KEY, GEMINI_API_KEY, DB_URL

# 3. Apply schema to Neon
psql "$DB_URL" -f schema.sql

# 4. Ingest (takes ~10 minutes due to Cohere free-tier rate limits)
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
- **Cohere free tier**: Rate-limited to ~100 API calls/minute; production usage needs a paid plan.
- **Sequential scan**: No HNSW index. Exact search is faster than index overhead at 1679 chunks; add one past ~50k rows.
