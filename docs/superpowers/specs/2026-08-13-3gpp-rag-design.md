# 3GPP Corrective RAG Chatbot — Design Spec

**Date:** 2026-08-13
**Status:** Approved design, pre-implementation
**Deadline:** 2026-08-17 (Mavenir GET AI/LLM assignment)
**Prior art:** `~/Documents/Projects/new/corrective-rag/` (TypeScript CRAG over SEC filings)
**Paper:** CRAG — Corrective Retrieval Augmented Generation (arXiv:2401.15884v3)

---

## 1. Summary

A RAG chatbot answering natural-language questions over **3GPP telecom standards**, built to
make hallucination structurally difficult rather than merely discouraged by prompt wording.

After hybrid retrieval, a **cross-encoder reranker grades every (query, chunk) pair**. An
**action trigger** compares the top score against two thresholds and routes to one of three
branches — `correct`, `ambiguous`, `incorrect`. The `incorrect` branch **refuses to answer**.
Every answer carries a citation to spec and clause. Every decision is streamed to an
**inspector panel** in the UI.

This is a Python port of a CRAG system the author already built and deployed in TypeScript.
The architecture is proven; the language, corpus, and correction policy change.

**Target audience:** Mavenir MavAI OPS (Agentic Service Assurance Platform). Emphasis on
agentic orchestration, evaluation rigour, and telecom-operations domain fit.

---

## 2. Goals & Non-Goals

### Goals
- Answer questions about 3GPP alarms, fault management, and KPIs with clause-level citations.
- **Refuse** out-of-scope questions rather than guessing — the headline demo behaviour.
- Implement the CRAG evaluator → action-trigger → corrective-action → generate loop as an
  explicit LangGraph state machine.
- Preserve **tables** through ingestion (TS 28.552 is largely tabular; losing tables guts
  every KPI answer).
- Produce two evaluation artefacts: a golden-set scorecard and a RAG-vs-CRAG head-to-head.
- Ship deployed on Vercel with a public URL and a Dockerfile.

### Non-Goals
- Fine-tuning any model.
- Multi-agent orchestration, tool calling, conversational memory. (Named as future work.)
- Web-search fallback — **deliberately removed**; see §5.
- Auth, accounts, multi-tenancy.

---

## 3. Corpus — verified 2026-08-13

3GPP version letters run sequentially: `f`=Rel-15, `g`=16, `h`=17, `i`=18, `j`=19, `k`=20.
Verified against the document headers (`28111-j50` → V19.5.0 Release 19; `28532-k10` →
V20.1.0 Release 20). A missing letter means that release of that spec does not exist, not
that the letter is skipped.

The `/ftp/Specs/latest/` path returns **HTTP 403**. Use `/ftp/Specs/archive/` and send a
browser `User-Agent`. Files are `.zip` archives, not bare documents.

### Tier 1 — core corpus (ingest all)

| Spec | File | Version | Topic | Extras |
|---|---|---|---|---|
| TS 28.111 | `28111-j50` | V19.5.0 (Rel-19) | Fault management / alarms | 2 OpenAPI YAML |
| TS 28.532 | `28532-k10` | V20.1.0 (Rel-20) | Management services (OSS interfaces) | 5 OpenAPI YAML |
| TS 28.552 | `28552-k30` | V20.3.0 (Rel-20) | 5G KPI / performance measurements | — |

Each zip also ships **OpenAPI 3.0.1 YAML** (86 schemas, 9 paths across 7 files) defining the
management-service REST interfaces the prose describes. These are ingested: asked "what
fields does an alarm notification carry?", the precise answer is in `TS28111_FaultNrm.yaml`,
not the prose. YANG models in the same zips are **skipped** — they encode the same NRM as the
YAML, and parsing them properly needs `pyang` for no additional coverage.

URL pattern:
`https://www.3gpp.org/ftp/Specs/archive/28_series/28.111/28111-j50.zip`

### Tier 2 — add on Day 3, once the pipeline is proven

| Spec | Version | Topic | Format | Size |
|---|---|---|---|---|
| TS 23.501 | `23501-k20` | 5G system architecture | `.docx` | 9.1 MB |
| TS 38.300 | `38300-j30` | 5G NR overall description | `.docx` | 8.1 MB |

### Two corpus decisions

**TS 28.545 is dropped.** Its newest version (`28545-h00`, Rel-17, 2021) ships as a legacy
binary `.doc`, which `python-docx` cannot read. It would require a LibreOffice headless
conversion step. **TS 28.111 supersedes it** for fault management, is `.docx`, and is far
newer (Rel-18, 2026-03). This removes a heavyweight dependency and improves the corpus.

**Tier 2 is deferred for time and focus, not budget.** Jina's free tier is **10M tokens**
shared between embedding and reranking. Tier 1 costs ~120k and Tier 2 ~700k, so all five
specs together consume under 10%. Budget is not the constraint.

The reasons to start with Tier 1:
- **Ingestion wall-clock.** `23501-k20.docx` is 9 MB, yielding 4,000+ chunks. With batching
  and 429 backoff that is a 30–60 minute run — expensive on Day 1.
- **Corpus focus.** 17 MB of architecture prose against 2.5 MB of operations content shifts
  the corpus centre of gravity away from alarms and KPIs, which are the demo's subject and
  Mavenir's domain.

The decision is reversible: ingestion upserts on conflict, so Tier 2 is added by dropping
more files into `data/raw/` and re-running. Add it on Day 3 once the loop is proven, then use
the eval harness to confirm alarm/KPI retrieval did not regress. Reverting is
`delete from chunks where spec in (...)`.

The budget item still worth watching is **threshold calibration**: each query reranks twice
(retrieved chunks, then sentence strips inside `recompose`), costing ~8k tokens, so a
30-question eval run is ~240k. Ten calibration passes is ~2.4M — comfortable at 10M, and
would have been fatal at 1M.

---

## 4. Architecture

Python backend, React static frontend, single Vercel deployment.

```
User question
  → HYBRID RETRIEVE  pgvector cosine + tsvector BM25, fused with RRF (k=60)
  → EVALUATE         Jina reranker scores every (query, chunk) pair → [0,1]
  → ACTION TRIGGER   top score vs upper/lower thresholds
      correct    → decompose-recompose: keep relevant strips, drop noise
      ambiguous  → rewrite query, retrieve once more, re-evaluate
      incorrect  → REFUSE — "Not found in the provided 3GPP specifications."
  → GENERATE         Gemini, strict grounded prompt, citations "TS 28.552 §5.1.1.2"
  → every step streamed to the UI inspector panel
```

The three-way branch is a **LangGraph** `StateGraph`. The prior TypeScript project
hand-rolled this graph deliberately, because LangGraph.js was the weaker sibling. In Python,
LangGraph is the mainstream implementation and is the first framework named in the job
description, so the decision flips.

### Retrieval — why hybrid

3GPP text is dense with exact identifiers (`NRCellCU`, `RRC.ConnEstabAtt`, clause numbers).
Pure dense retrieval misses exact-token matches; pure BM25 misses paraphrase. Postgres holds
both a `vector(1024)` column and a `tsvector` column in the same table, so hybrid retrieval
is one SQL statement with Reciprocal Rank Fusion — no second system, no separate BM25 index
to rebuild at boot.

Under ~50k rows a sequential scan is single-digit milliseconds, so **no HNSW/IVFFlat index is
created**. Add one only when row count or measured p95 latency demands it.

---

## 5. Correction policy — the key adaptation

The prior SEC project routed the `incorrect` branch to a **Tavily web search**. For 3GPP that
is exactly backwards: the assignment's premise is answering *only* from the standards, so a
web fallback would become the primary hallucination source.

The branch is rewired to **refuse**. Same trigger, same thresholds, refusal replacing search.

| Branch | Condition | Action |
|---|---|---|
| `correct` | top score ≥ `UPPER` (0.55) | decompose-recompose, answer with citations |
| `ambiguous` | `LOWER` ≤ top < `UPPER` | rewrite query, retrieve once more, then answer or refuse |
| `incorrect` | top score < `LOWER` (0.30) | refuse |

Thresholds are env-configurable and **calibrated from the eval set**, not guessed. The
retry is capped at one to bound latency.

---

## 6. Hallucination controls (defence in depth)

1. **Hybrid retrieval** — reduces the chance the right chunk is never retrieved.
2. **Cross-encoder grading** — a reranker judges relevance far better than cosine distance.
3. **Confidence gate** — the `incorrect` branch refuses outright.
4. **Decompose-recompose** — sentence-level filtering strips irrelevant text out of otherwise
   relevant chunks, shrinking the surface the model can drift into.
5. **Strict grounded prompt** — answer only from context; no inference or extrapolation.
6. **Mandatory citations** — every claim cites spec + clause; the eval verifies cited clauses
   actually exist.
7. **Visible reasoning** — the inspector panel makes each decision auditable.

---

## 7. Evaluation

The job description lists "AI Evaluation Techniques" as a core skill and "continuous
evaluation and feedback loops" as a responsibility. Evaluation is a deliverable, not a
nicety.

**Golden set:** 30 questions — 20 answerable from Tier 1, 10 deliberately out-of-scope
(adjacent-but-absent topics, so they are genuinely hard to refuse).

**Metrics:**
| Metric | Definition | Target |
|---|---|---|
| Answer accuracy | Gemini-as-judge vs reference answer | ≥ 80% |
| Citation validity | cited clause exists and contains the answer | ≥ 90% |
| Refusal rate (out-of-scope) | correctly refused | ≥ 90% |
| False-refusal rate (in-scope) | wrongly refused | ≤ 10% |

**Study:** RAG vs CRAG head-to-head on the same set — vanilla top-k with no grading or
correction, against the full loop. Ported from `eval/rag-vs-crag.ts`.

The false-refusal metric matters as much as the refusal rate: a system that refuses
everything scores perfectly on hallucination and is useless. Reporting both is the honest
framing, and is the interview talking point.

---

## 8. Tech stack

| Concern | Choice | Rationale |
|---|---|---|
| Language | Python 3.13 | JD: mandatory |
| Orchestration | LangGraph | JD: named first; graph is a real state machine |
| Ingestion | `firecrawl-anydoc` → Markdown | one call, tables as GFM; replaces a hand-rolled XML walker |
| Embeddings | `jina-embeddings-v3`, 1024d | task-specific query/passage modes; port exists |
| Reranker | `jina-reranker-v2-base-multilingual` | HTTP API — no torch, fits serverless |
| Generator | Gemini (`GEMINI_MODEL` env) | free tier |
| Vector DB | Neon Postgres + pgvector + tsvector | one store for dense + sparse |
| API | FastAPI | JD: mandatory |
| Frontend | Vite + React (static) | inspector panel |
| Deployment | Vercel (static + Python function) + Dockerfile | Dockerfile as K8s signal |

Embedding dimension **1024** matches `jina-embeddings-v3` and the prior project's schema.

### Risks

- **Model name** — `GEMINI_MODEL` is env-driven and verified by a `/health` probe at startup,
  so a wrong string fails loudly rather than mid-demo. A "lite" tier may drift on the
  "answer only from context" constraint; swapping to full Flash is a one-line change.
- **Jina free-tier budget** — 10M tokens shared between embedding and reranking. Ingesting
  all five specs costs under 10%, so corpus size is not constrained. The consumer to watch is
  repeated eval runs during threshold calibration (~240k per run).
- **Vercel function timeout** — the full loop with one retry must fit in 60s. Retry is capped
  at one. Ingestion is an offline script, never serverless.
- **3GPP access** — `/latest/` is 403; `/archive/` with a browser User-Agent works. Specs are
  vendored into `data/` after first download so the build never depends on 3gpp.org.
