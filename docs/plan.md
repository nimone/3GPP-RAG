# 3GPP Corrective RAG Chatbot — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A RAG chatbot over 3GPP telecom standards that cites clause-level sources and refuses to answer when retrieval confidence is low.

**Architecture:** Hybrid retrieval (pgvector + tsvector fused by RRF) feeds a Jina cross-encoder that grades every (query, chunk) pair. A LangGraph state machine routes on the top score to one of three branches — answer, retry-once, or refuse. Gemini generates only from filtered context, with mandatory citations. Every decision streams to a React inspector panel.

**Tech Stack:** Python 3.13, LangGraph, LangChain, `python-docx`, Jina embeddings v3 + reranker v2, Gemini, Neon Postgres (pgvector + tsvector), FastAPI, Vite + React, Vercel.

**Spec:** `docs/design.md`

## Global Constraints

- Python **3.13**, dependency management via **uv**.
- Embedding dimension is **1024** (`jina-embeddings-v3`). Every `vector(1024)` reference must match.
- Jina reranker returns results **sorted by relevance** — always realign scores to input order by `index`. Silent misalignment is the most likely bug in this codebase.
- Jina free tier rate-limits hard (HTTP 429). All Jina calls use exponential backoff, 6 attempts, starting 2s.
- Never split a table row across chunks.
- Citation format is exactly `TS <spec> §<clause>`, e.g. `TS 28.552 §5.1.1.2`.
- The `incorrect` branch **refuses**. There is no web-search fallback. Do not add one.
- Retry is capped at **one** re-retrieval, to fit Vercel's 60s function limit.
- Model name comes from the `GEMINI_MODEL` env var. Never hardcode it.
- All secrets via env vars. Never commit `.env`.
- Commit after every task.

**Corpus (downloaded and verified 2026-08-13):**

| File | Sections w/ body | Tables | Notes |
|---|---|---|---|
| `data/raw/28111-j50.docx` | 99 clauses | 41 | fault management |
| `data/raw/28532-k10.docx` | 310 clauses | 249 | management services — table-heavy |
| `data/raw/28552-k30.docx` | 823 clauses | 18 | KPIs — lettered-list template, avg 1122 chars/clause |
| `data/raw/openapi/*.yaml` | 86 schemas, 9 paths | — | 7 files, OpenAPI 3.0.1 |

Ingestion must glob these directories, never hardcode filenames — Tier 2 specs get added later by dropping in more files.

**Heading format:** clause and title are separated by a **tab** (`"3.1\tDefinitions"`), not spaces. `\s+` in `CLAUSE_RE` handles this; do not narrow it to `" +"`.

**Container clauses:** 272 of 28552's 1095 headings have empty bodies (they only contain sub-clauses). `parse_docx` drops them via the `if clause and buf` guard. This is correct — do not "fix" it.

---

## File Structure

```
rag-assesment/
├── pyproject.toml              # uv deps
├── schema.sql                  # Neon: chunks table, tsvector trigger
├── vercel.json                 # static + /api rewrite
├── Dockerfile                  # K8s signal; not used by Vercel
├── .env.example
├── README.md                   # architecture, eval results, demo
├── data/raw/                   # user-supplied .docx (gitignored)
├── api/index.py                # Vercel entrypoint → FastAPI app
├── src/threegpp_rag/
│   ├── config.py               # env loading, thresholds, model names
│   ├── types.py                # Chunk, ScoredChunk, CragAction, TraceEvent
│   ├── db.py                   # psycopg connection + query helper
│   ├── jina.py                 # embed + rerank client with backoff
│   ├── ingest/
│   │   ├── parse.py            # docx → sections, tables preserved
│   │   ├── chunk.py            # section-aware chunking + metadata
│   │   └── run.py              # CLI: parse → embed → upsert
│   ├── retrieval.py            # hybrid RRF query
│   ├── crag/
│   │   ├── decompose.py        # strips + recompose
│   │   ├── action.py           # threshold trigger
│   │   └── graph.py            # LangGraph state machine
│   ├── generate.py             # Gemini, strict prompt, citations
│   └── app.py                  # FastAPI routes + SSE
├── frontend/                   # Vite + React
│   └── src/{App.jsx,Inspector.jsx}
├── eval/
│   ├── data/{qa.jsonl,relevance.jsonl}
│   ├── run_eval.py             # golden set scorecard
│   └── rag_vs_crag.py          # head-to-head
└── tests/
```

**Day mapping:** Day 1 → Tasks 1–4 (incl. 3b) · Day 2 → Tasks 5–8 · Day 3 → Tasks 9–11 · Day 4 → Tasks 12–13.

---

### Task 1: Project skeleton, config, types

**Files:**
- Create: `pyproject.toml`, `.env.example`, `.gitignore`, `src/threegpp_rag/config.py`, `src/threegpp_rag/types.py`
- Test: `tests/test_config.py`

**Interfaces:**
- Produces: `Settings` dataclass with `jina_api_key`, `gemini_api_key`, `gemini_model`, `db_url`, `upper_threshold`, `lower_threshold`, `keep_threshold`, `top_k`; `get_settings() -> Settings`. `Chunk`, `ScoredChunk`, `CragAction`, `TraceEvent` types.

- [ ] **Step 1: Initialise the project**

```bash
cd /media/DATA/Linux/home/Documents/Assignments/mavenir/rag-assesment
git init
uv init --name threegpp-rag --python 3.13
uv add langgraph langchain-core firecrawl-anydoc pyyaml psycopg[binary] httpx \
       google-genai fastapi "uvicorn[standard]" python-dotenv
uv add --dev pytest pytest-asyncio
mkdir -p src/threegpp_rag/{ingest,crag} tests eval/data data/raw api frontend
touch src/threegpp_rag/__init__.py src/threegpp_rag/ingest/__init__.py src/threegpp_rag/crag/__init__.py
```

- [ ] **Step 2: Write `.gitignore`**

```
.env
.venv/
__pycache__/
data/raw/
frontend/node_modules/
frontend/dist/
.vercel/
```

- [ ] **Step 3: Write the failing test**

```python
# tests/test_config.py
import pytest
from threegpp_rag.config import get_settings

def test_settings_read_from_env(monkeypatch):
    monkeypatch.setenv("JINA_API_KEY", "jk")
    monkeypatch.setenv("GEMINI_API_KEY", "gk")
    monkeypatch.setenv("GEMINI_MODEL", "gemini-x")
    monkeypatch.setenv("DB_URL", "postgres://x")
    get_settings.cache_clear()
    s = get_settings()
    assert s.jina_api_key == "jk"
    assert s.gemini_model == "gemini-x"
    assert s.upper_threshold == 0.55   # default
    assert s.lower_threshold == 0.30   # default

def test_missing_required_env_raises(monkeypatch):
    monkeypatch.delenv("JINA_API_KEY", raising=False)
    monkeypatch.setenv("GEMINI_API_KEY", "gk")
    monkeypatch.setenv("DB_URL", "postgres://x")
    get_settings.cache_clear()
    with pytest.raises(RuntimeError, match="JINA_API_KEY"):
        get_settings()
```

- [ ] **Step 4: Run it to make sure it fails**

Run: `uv run pytest tests/test_config.py -v`
Expected: FAIL — `ModuleNotFoundError: threegpp_rag.config`

- [ ] **Step 5: Write `types.py`**

```python
# src/threegpp_rag/types.py
from dataclasses import dataclass, field
from typing import Literal, Any

CragAction = Literal["correct", "ambiguous", "incorrect"]

@dataclass
class Chunk:
    id: str
    text: str
    spec: str        # "TS 28.552"
    clause: str      # "5.1.1.2"
    title: str       # "Number of RRC connection establishment attempts"

    @property
    def citation(self) -> str:
        return f"{self.spec} §{self.clause}"

@dataclass
class ScoredChunk:
    chunk: Chunk
    score: float     # normalised relevance, 0..1

@dataclass
class TraceEvent:
    step: str
    data: dict[str, Any] = field(default_factory=dict)
```

- [ ] **Step 6: Write `config.py`**

```python
# src/threegpp_rag/config.py
import os
from dataclasses import dataclass
from functools import lru_cache
from dotenv import load_dotenv

load_dotenv()

def _req(name: str) -> str:
    v = os.environ.get(name)
    if not v:
        raise RuntimeError(f"Missing required env var: {name}")
    return v

def _f(name: str, default: float) -> float:
    return float(os.environ.get(name, default))

@dataclass(frozen=True)
class Settings:
    jina_api_key: str
    gemini_api_key: str
    gemini_model: str
    db_url: str
    upper_threshold: float
    lower_threshold: float
    keep_threshold: float
    top_k: int

@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings(
        jina_api_key=_req("JINA_API_KEY"),
        gemini_api_key=_req("GEMINI_API_KEY"),
        gemini_model=os.environ.get("GEMINI_MODEL", "gemini-2.5-flash"),
        db_url=_req("DB_URL"),
        upper_threshold=_f("CRAG_UPPER", 0.55),
        lower_threshold=_f("CRAG_LOWER", 0.30),
        keep_threshold=_f("CRAG_KEEP", 0.25),
        top_k=int(os.environ.get("CRAG_TOP_K", 8)),
    )
```

- [ ] **Step 7: Write `.env.example`**

```
JINA_API_KEY=
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
DB_URL=postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require
CRAG_UPPER=0.55
CRAG_LOWER=0.30
CRAG_KEEP=0.25
CRAG_TOP_K=8
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `uv run pytest tests/test_config.py -v`
Expected: PASS (2 tests)

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "feat: project skeleton, config, core types"
```

---

### Task 2: Jina client — embeddings and reranker

Port of `src/lib/embeddings/jina.ts` and `src/lib/evaluator/jina-reranker.ts`.

**Files:**
- Create: `src/threegpp_rag/jina.py`
- Test: `tests/test_jina.py`

**Interfaces:**
- Consumes: `get_settings()` from Task 1.
- Produces: `embed(texts: list[str], task: Literal["passage","query"]) -> list[list[float]]`; `rerank(query: str, docs: list[str]) -> list[float]` returning scores **aligned to input order**. Both accept an optional `client: httpx.Client` for tests.

- [ ] **Step 1: Write the failing test**

The realignment test is the important one — Jina returns results sorted by score, not input order.

```python
# tests/test_jina.py
import httpx, pytest
from threegpp_rag.jina import embed, rerank

def _client(handler):
    return httpx.Client(transport=httpx.MockTransport(handler))

def test_rerank_realigns_to_input_order():
    # Jina returns descending by score; doc at index 2 is most relevant.
    def handler(request):
        return httpx.Response(200, json={"results": [
            {"index": 2, "relevance_score": 0.9},
            {"index": 0, "relevance_score": 0.5},
            {"index": 1, "relevance_score": 0.1},
        ]})
    scores = rerank("q", ["a", "b", "c"], api_key="k", client=_client(handler))
    assert scores == [0.5, 0.1, 0.9]

def test_rerank_empty_docs_short_circuits():
    def handler(request):
        raise AssertionError("must not call the API for empty input")
    assert rerank("q", [], api_key="k", client=_client(handler)) == []

def test_embed_sorts_by_index():
    def handler(request):
        return httpx.Response(200, json={"data": [
            {"index": 1, "embedding": [2.0]},
            {"index": 0, "embedding": [1.0]},
        ]})
    assert embed(["a", "b"], "passage", api_key="k", client=_client(handler)) == [[1.0], [2.0]]

def test_retries_on_429_then_succeeds():
    calls = {"n": 0}
    def handler(request):
        calls["n"] += 1
        if calls["n"] < 3:
            return httpx.Response(429, json={"detail": "rate limited"})
        return httpx.Response(200, json={"results": [{"index": 0, "relevance_score": 0.7}]})
    scores = rerank("q", ["a"], api_key="k", client=_client(handler), base_delay=0.0)
    assert scores == [0.7]
    assert calls["n"] == 3

def test_raises_after_exhausting_retries():
    def handler(request):
        return httpx.Response(429, json={"detail": "rate limited"})
    with pytest.raises(RuntimeError, match="rate limit"):
        rerank("q", ["a"], api_key="k", client=_client(handler), base_delay=0.0)
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `uv run pytest tests/test_jina.py -v`
Expected: FAIL — `ModuleNotFoundError: threegpp_rag.jina`

- [ ] **Step 3: Implement `jina.py`**

```python
# src/threegpp_rag/jina.py
import time
from typing import Literal
import httpx
from threegpp_rag.config import get_settings

EMBED_URL = "https://api.jina.ai/v1/embeddings"
RERANK_URL = "https://api.jina.ai/v1/rerank"
EMBED_MODEL = "jina-embeddings-v3"
RERANK_MODEL = "jina-reranker-v2-base-multilingual"
DIMENSIONS = 1024
MAX_ATTEMPTS = 6

def _post(url: str, payload: dict, api_key: str, client: httpx.Client, base_delay: float) -> dict:
    """POST with exponential backoff on 429. Jina's free tier rate-limits aggressively."""
    delay = base_delay
    for attempt in range(1, MAX_ATTEMPTS + 1):
        resp = client.post(
            url,
            json=payload,
            headers={"Authorization": f"Bearer {api_key}", "content-type": "application/json"},
            timeout=120.0,
        )
        if resp.status_code == 429:
            if attempt == MAX_ATTEMPTS:
                raise RuntimeError(f"Jina rate limit: exhausted {MAX_ATTEMPTS} attempts")
            print(f"  jina 429, retrying in {delay}s (attempt {attempt}/{MAX_ATTEMPTS})")
            time.sleep(delay)
            delay = delay * 2 if delay else 0.0
            continue
        if resp.status_code != 200:
            raise RuntimeError(f"Jina error {resp.status_code}: {resp.text}")
        return resp.json()
    raise RuntimeError("unreachable")

def embed(
    texts: list[str],
    task: Literal["passage", "query"],
    *,
    api_key: str | None = None,
    client: httpx.Client | None = None,
    base_delay: float = 2.0,
) -> list[list[float]]:
    if not texts:
        return []
    api_key = api_key or get_settings().jina_api_key
    owned = client is None
    client = client or httpx.Client()
    try:
        data = _post(EMBED_URL, {
            "model": EMBED_MODEL,
            "input": texts,
            "task": "retrieval.query" if task == "query" else "retrieval.passage",
            "dimensions": DIMENSIONS,
            "truncate": True,
        }, api_key, client, base_delay)
    finally:
        if owned:
            client.close()
    # Results may arrive out of order — sort by index before returning.
    return [d["embedding"] for d in sorted(data["data"], key=lambda d: d["index"])]

def rerank(
    query: str,
    docs: list[str],
    *,
    api_key: str | None = None,
    client: httpx.Client | None = None,
    base_delay: float = 2.0,
) -> list[float]:
    """Relevance score in [0,1] per doc, aligned to input order."""
    if not docs:
        return []
    api_key = api_key or get_settings().jina_api_key
    owned = client is None
    client = client or httpx.Client()
    try:
        data = _post(RERANK_URL, {
            "model": RERANK_MODEL,
            "query": query,
            "documents": docs,
            "top_n": len(docs),   # score every doc, not just the best
        }, api_key, client, base_delay)
    finally:
        if owned:
            client.close()
    # Jina sorts by relevance — realign to input order.
    scores = [0.0] * len(docs)
    for r in data["results"]:
        scores[r["index"]] = r["relevance_score"]
    return scores
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run pytest tests/test_jina.py -v`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: jina embeddings and reranker client with backoff"
```

---

### Task 3: Spec parser — Markdown via anydoc

`firecrawl-anydoc` converts the `.docx` to GitHub-Flavored Markdown in one call: headings become `#`-prefixed lines and tables become pipe tables. Benchmarked on the real corpus at **0.37s for `28552-k30.docx`**, finding 1096 clause headings and 580 table rows — matching a hand-rolled `python-docx` XML walker while replacing ~60 lines with one.

Parsing therefore splits into a **pure function over Markdown** (fast, exhaustively testable) and a thin wrapper that calls anydoc.

**Files:**
- Create: `src/threegpp_rag/ingest/parse.py`
- Test: `tests/test_parse.py`

**Interfaces:**
- Produces: `Section` dataclass (`spec`, `clause`, `title`, `body`); `sections_from_markdown(md: str, spec: str) -> list[Section]`; `parse_docx(path: Path, spec: str) -> list[Section]`.

**Add the dependency first:**

```bash
uv add firecrawl-anydoc pyyaml
```

**Two traps this task must handle — both observed in the real files:**

1. **The table of contents.** Every 3GPP spec opens with a TOC listing every clause (`5.1.1.1.1 Average delay DL air-interface 38`). anydoc renders TOC entries as *plain paragraphs*, real headings as `#`-prefixed. Requiring `^#+` excludes the TOC. Matching bare clause numbers anywhere would ingest the whole TOC as fake sections.
2. **Cover-page tables.** `28532-k10.docx` renders its title page as a table before the first heading. Content preceding the first heading is dropped, which handles it.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_parse.py
from pathlib import Path
import pytest
from threegpp_rag.ingest.parse import Section, parse_docx, sections_from_markdown

MD = """\
| cover | page |
| --- | --- |
| 3GPP TS 28.111 V19.5.0 | |

5.1.1 Some TOC entry 38
5.1.2 Another TOC entry 39

# 4 Concepts and overview

Fault supervision is described here.

## 4.1 Alarm notifications

An alarm is a notification of a specific event.

| Field | Description |
| --- | --- |
| alarmId | Identifies the alarm |

Trailing text after the table.

## 4.2 Container clause

### 4.2.1 Leaf clause

Leaf body text.
"""

def test_splits_on_heading_clauses():
    secs = sections_from_markdown(MD, "TS 28.111")
    assert [s.clause for s in secs] == ["4", "4.1", "4.2.1"]
    assert secs[0].title == "Concepts and overview"
    assert secs[0].spec == "TS 28.111"

def test_toc_lines_are_not_sections():
    # TOC entries lack a '#' prefix and must never become sections
    secs = sections_from_markdown(MD, "TS 28.111")
    assert all("TOC entry" not in s.title for s in secs)
    assert "5.1.1" not in [s.clause for s in secs]

def test_cover_table_before_first_heading_is_dropped():
    secs = sections_from_markdown(MD, "TS 28.111")
    assert all("3GPP TS 28.111 V19.5.0" not in s.body for s in secs)

def test_table_preserved_in_document_order():
    secs = sections_from_markdown(MD, "TS 28.111")
    body = next(s for s in secs if s.clause == "4.1").body
    assert "| alarmId | Identifies the alarm |" in body
    assert body.index("An alarm is") < body.index("alarmId") < body.index("Trailing text")

def test_container_clause_with_no_body_is_dropped():
    secs = sections_from_markdown(MD, "TS 28.111")
    # 4.2 holds only sub-clause 4.2.1, so it carries no body of its own
    assert "4.2" not in [s.clause for s in secs]
    assert "4.2.1" in [s.clause for s in secs]

def test_citation_uses_section_metadata():
    secs = sections_from_markdown(MD, "TS 28.111")
    assert secs[1].spec == "TS 28.111" and secs[1].clause == "4.1"

def test_boilerplate_titles_skipped():
    md = "# 1 Scope\n\nThis document...\n\n# 4 Real content\n\nBody.\n"
    secs = sections_from_markdown(md, "TS 28.111")
    assert [s.clause for s in secs] == ["4"]
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `uv run pytest tests/test_parse.py -v`
Expected: FAIL — `ModuleNotFoundError: threegpp_rag.ingest.parse`

- [ ] **Step 3: Implement `parse.py`**

```python
# src/threegpp_rag/ingest/parse.py
import re
from dataclasses import dataclass
from pathlib import Path
import anydoc

# A real clause heading: markdown '#'s, then a dotted number, then a title.
# The '#' prefix is what separates genuine headings from table-of-contents
# lines, which anydoc renders as plain paragraphs.
HEADING = re.compile(r"^(#+)[ \t]+(\d+(?:\.\d+)*)[ \t]+(\S.*?)[ \t]*$", re.M)

# Front matter that adds no retrievable knowledge.
SKIP_TITLES = {"scope", "references", "foreword", "change history",
               "definitions", "abbreviations", "terms"}

@dataclass
class Section:
    spec: str
    clause: str
    title: str
    body: str

def sections_from_markdown(md: str, spec: str) -> list[Section]:
    """Split Markdown into one Section per clause heading.

    Text before the first heading is dropped: in 3GPP documents that is the
    cover page and the table of contents, neither of which is worth embedding.
    """
    matches = list(HEADING.finditer(md))
    sections: list[Section] = []
    for i, m in enumerate(matches):
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(md)
        body = md[start:end].strip()
        if not body:
            continue      # container clause: holds only sub-clauses
        title = m.group(3).strip()
        if title.lower() in SKIP_TITLES:
            continue
        sections.append(Section(spec=spec, clause=m.group(2), title=title, body=body))
    return sections

def parse_docx(path: Path, spec: str) -> list[Section]:
    return sections_from_markdown(anydoc.to_markdown(str(path)), spec)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run pytest tests/test_parse.py -v`
Expected: PASS (7 tests)

- [ ] **Step 5: Verify against the real corpus**

```bash
uv run python -c "
from pathlib import Path
from threegpp_rag.ingest.parse import parse_docx
import glob, re
for f in sorted(glob.glob('data/raw/*.docx')):
    secs = parse_docx(Path(f), 'TS TEST')
    tbl = sum(1 for s in secs if re.search(r'^\|', s.body, re.M))
    avg = sum(len(s.body) for s in secs) // max(len(secs), 1)
    print(f'{f.split(\"/\")[-1]:20s} sections={len(secs):5d} with_tables={tbl:4d} avg_chars={avg}')
    print(f'{\"\":20s} first: {secs[0].clause} {secs[0].title[:50]}')
"
```

Expected, based on the verified corpus:

| File | Sections | Notes |
|---|---|---|
| `28111-j50.docx` | ~90 | 41 tables in source |
| `28532-k10.docx` | ~300 | table-heavy (1691 rows) |
| `28552-k30.docx` | ~800 | avg body ≈ 1100 chars |

**Stop and fix if:** any file yields 0 sections; `28552` yields more than ~1100 (the TOC leaked in); or `with_tables` is 0 for `28532`.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: spec parser via anydoc markdown conversion"
```

---

### Task 3b: OpenAPI YAML parser

The zips ship OpenAPI 3.0.1 definitions of the management-service REST interfaces — 86 schemas and 9 paths across 7 files. These answer structural questions ("what fields does an alarm notification carry?") that the prose does not state precisely.

Output is `Section` objects, so everything downstream is unchanged.

**Files:**
- Create: `src/threegpp_rag/ingest/parse_openapi.py`
- Test: `tests/test_parse_openapi.py`

**Interfaces:**
- Consumes: `Section` from Task 3.
- Produces: `parse_openapi(path: Path) -> list[Section]`. Clause is `OpenAPI/<Doc>#<SchemaName>`, so citations read `TS 28.111 §OpenAPI/FaultNrm#AlarmRecord`.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_parse_openapi.py
from pathlib import Path
import yaml
from threegpp_rag.ingest.parse_openapi import parse_openapi, spec_from_filename

SPEC = {
    "openapi": "3.0.1",
    "info": {"title": "TS 28.111 Fault NRM", "version": "19.5.0"},
    "components": {"schemas": {
        "AlarmRecord": {
            "type": "object",
            "description": "Represents an alarm.",
            "properties": {
                "alarmId": {"type": "string", "description": "Unique identifier"},
                "perceivedSeverity": {"type": "string", "enum": ["CRITICAL", "MAJOR"]},
            },
            "required": ["alarmId"],
        },
    }},
    "paths": {"/alarms": {"get": {"summary": "List alarms", "operationId": "getAlarmList"}}},
}

def test_spec_from_filename():
    assert spec_from_filename(Path("TS28111_FaultNrm.yaml")) == ("TS 28.111", "FaultNrm")

def test_schema_becomes_a_section(tmp_path):
    p = tmp_path / "TS28111_FaultNrm.yaml"
    p.write_text(yaml.safe_dump(SPEC))
    secs = parse_openapi(p)
    schema = next(s for s in secs if "AlarmRecord" in s.clause)
    assert schema.spec == "TS 28.111"
    assert schema.clause == "OpenAPI/FaultNrm#AlarmRecord"
    assert "alarmId" in schema.body
    assert "Unique identifier" in schema.body
    assert "CRITICAL" in schema.body          # enums are retrievable values
    assert "required" in schema.body.lower()

def test_path_operation_becomes_a_section(tmp_path):
    p = tmp_path / "TS28111_FaultNrm.yaml"
    p.write_text(yaml.safe_dump(SPEC))
    secs = parse_openapi(p)
    op = next(s for s in secs if "/alarms" in s.body)
    assert "GET" in op.body and "getAlarmList" in op.body

def test_empty_spec_yields_nothing(tmp_path):
    p = tmp_path / "TS28532_Empty.yaml"
    p.write_text(yaml.safe_dump({"openapi": "3.0.1"}))
    assert parse_openapi(p) == []
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `uv run pytest tests/test_parse_openapi.py -v`
Expected: FAIL — `ModuleNotFoundError: threegpp_rag.ingest.parse_openapi`

- [ ] **Step 3: Implement `parse_openapi.py`**

```python
# src/threegpp_rag/ingest/parse_openapi.py
import re
from pathlib import Path
import yaml
from threegpp_rag.ingest.parse import Section

FILENAME = re.compile(r"TS(\d{2})(\d{3})_(\w+)")

def spec_from_filename(path: Path) -> tuple[str, str]:
    """'TS28111_FaultNrm.yaml' -> ('TS 28.111', 'FaultNrm')"""
    m = FILENAME.match(path.stem)
    if not m:
        raise ValueError(f"Unexpected OpenAPI filename: {path.name}")
    return f"TS {m.group(1)}.{m.group(2)}", m.group(3)

def _render_schema(name: str, schema: dict) -> str:
    """Flatten a schema to prose+list form so the reranker can score it.

    Raw YAML scores poorly against natural-language questions; naming the
    fields and their descriptions in plain text retrieves far better.
    """
    lines = [f"Schema: {name}"]
    if desc := schema.get("description"):
        lines.append(desc)
    if required := schema.get("required"):
        lines.append(f"Required properties: {', '.join(required)}")
    for prop, meta in (schema.get("properties") or {}).items():
        meta = meta if isinstance(meta, dict) else {}
        bits = [f"- {prop}"]
        if t := meta.get("type"):
            bits.append(f"({t})")
        if d := meta.get("description"):
            bits.append(f": {d}")
        if enum := meta.get("enum"):
            bits.append(f"[allowed values: {', '.join(map(str, enum))}]")
        if ref := meta.get("$ref"):
            bits.append(f"(reference: {ref.split('/')[-1]})")
        lines.append(" ".join(bits))
    return "\n".join(lines)

def parse_openapi(path: Path) -> list[Section]:
    spec_num, doc = spec_from_filename(path)
    data = yaml.safe_load(path.read_text()) or {}
    sections: list[Section] = []

    for name, schema in ((data.get("components") or {}).get("schemas") or {}).items():
        if not isinstance(schema, dict):
            continue
        sections.append(Section(
            spec=spec_num,
            clause=f"OpenAPI/{doc}#{name}",
            title=f"{name} schema",
            body=_render_schema(name, schema),
        ))

    for route, ops in (data.get("paths") or {}).items():
        if not isinstance(ops, dict):
            continue
        for method, op in ops.items():
            if not isinstance(op, dict):
                continue
            body = [f"{method.upper()} {route}"]
            if s := op.get("summary"):
                body.append(s)
            if d := op.get("description"):
                body.append(d)
            if oid := op.get("operationId"):
                body.append(f"operationId: {oid}")
            sections.append(Section(
                spec=spec_num,
                clause=f"OpenAPI/{doc}#{method.upper()}{route}",
                title=f"{method.upper()} {route}",
                body="\n".join(body),
            ))
    return sections
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run pytest tests/test_parse_openapi.py -v`
Expected: PASS (4 tests)

- [ ] **Step 5: Verify against the real YAML**

```bash
uv run python -c "
from pathlib import Path
from threegpp_rag.ingest.parse_openapi import parse_openapi
import glob
total = 0
for f in sorted(glob.glob('data/raw/openapi/*.yaml')):
    secs = parse_openapi(Path(f))
    total += len(secs)
    print(f'{f.split(\"/\")[-1]:38s} {len(secs):3d} sections')
print('total', total)
"
```

Expected: ~95 sections total (86 schemas + 9 path operations). `TS28111_FaultNrm.yaml` should yield 29.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: openapi yaml parser for management service schemas"
```

### Task 4: Section-aware chunking

**Files:**
- Create: `src/threegpp_rag/ingest/chunk.py`
- Test: `tests/test_chunk.py`

**Interfaces:**
- Consumes: `Section` from Task 3, `Chunk` from Task 1.
- Produces: `chunk_sections(sections: list[Section], max_chars: int = 1600, overlap: int = 200) -> list[Chunk]`. Chunk ids are `"{spec}|{clause}|{i}"` with spaces stripped.

Rationale for `max_chars=1600`: roughly 400 tokens at ~4 chars/token, matching the agreed 400-token target without a tokeniser dependency.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_chunk.py
from threegpp_rag.ingest.parse import Section
from threegpp_rag.ingest.chunk import chunk_sections

def test_short_section_becomes_one_chunk():
    secs = [Section("TS 28.111", "4.1", "Alarms", "Short body text.")]
    chunks = chunk_sections(secs)
    assert len(chunks) == 1
    assert chunks[0].id == "TS28.111|4.1|0"
    assert chunks[0].citation == "TS 28.111 §4.1"

def test_long_section_splits_with_overlap():
    body = "\n\n".join(f"Paragraph number {i} with filler text." for i in range(200))
    chunks = chunk_sections([Section("TS 28.552", "5.1", "KPIs", body)], max_chars=500, overlap=100)
    assert len(chunks) > 1
    assert all(len(c.text) <= 700 for c in chunks)   # max_chars + overlap headroom
    assert all(c.clause == "5.1" for c in chunks)

def test_table_rows_are_never_split():
    table = "\n".join(f"| row{i} | value{i} |" for i in range(80))
    chunks = chunk_sections([Section("TS 28.552", "5.2", "T", table)], max_chars=300, overlap=0)
    for c in chunks:
        for line in c.text.splitlines():
            if line.startswith("|"):
                assert line.endswith("|"), f"table row was cut: {line!r}"

def test_every_chunk_carries_heading_context():
    chunks = chunk_sections([Section("TS 28.552", "5.1", "Number of attempts", "Body.")])
    # heading is prepended so the reranker sees what the chunk is about
    assert "5.1" in chunks[0].text and "Number of attempts" in chunks[0].text
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `uv run pytest tests/test_chunk.py -v`
Expected: FAIL — `ModuleNotFoundError: threegpp_rag.ingest.chunk`

- [ ] **Step 3: Implement `chunk.py`**

```python
# src/threegpp_rag/ingest/chunk.py
from threegpp_rag.ingest.parse import Section
from threegpp_rag.types import Chunk

def _split_units(body: str) -> list[str]:
    """Split into atomic units: paragraphs, and table rows as whole lines."""
    units: list[str] = []
    for block in body.split("\n\n"):
        if "|" in block and "\n" in block:
            units.extend(block.splitlines())   # keep each table row intact
        else:
            units.append(block)
    return [u for u in units if u.strip()]

def chunk_sections(
    sections: list[Section],
    max_chars: int = 1600,
    overlap: int = 200,
) -> list[Chunk]:
    chunks: list[Chunk] = []
    for sec in sections:
        # Prepend the heading so an isolated chunk still says what it is about.
        header = f"[{sec.spec} §{sec.clause}] {sec.title}"
        units = _split_units(sec.body)
        buf: list[str] = []
        size = 0
        idx = 0

        def emit(parts: list[str]) -> None:
            nonlocal idx
            text = header + "\n\n" + "\n".join(parts)
            chunks.append(Chunk(
                id=f"{sec.spec.replace(' ', '')}|{sec.clause}|{idx}",
                text=text, spec=sec.spec, clause=sec.clause, title=sec.title,
            ))
            idx += 1

        for unit in units:
            if buf and size + len(unit) > max_chars:
                emit(buf)
                # carry trailing units back as overlap for continuity
                tail, tail_len = [], 0
                for u in reversed(buf):
                    if tail_len + len(u) > overlap:
                        break
                    tail.insert(0, u)
                    tail_len += len(u)
                buf, size = tail, tail_len
            buf.append(unit)
            size += len(unit)
        if buf:
            emit(buf)
    return chunks
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run pytest tests/test_chunk.py -v`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: section-aware chunking preserving table rows"
```

---

### Task 5: Database schema and ingestion CLI

**Files:**
- Create: `schema.sql`, `src/threegpp_rag/db.py`, `src/threegpp_rag/ingest/run.py`
- Test: `tests/test_db.py`

**Interfaces:**
- Consumes: `chunk_sections` (Task 4), `parse_docx` (Task 3), `embed` (Task 2).
- Produces: `query(sql, params) -> list[dict]`; `to_pgvector(list[float]) -> str`; ingestion CLI `uv run python -m threegpp_rag.ingest.run`.

- [ ] **Step 1: Write `schema.sql`**

No ANN index by design — under ~50k rows a sequential scan is single-digit milliseconds.

```sql
-- schema.sql — run once against Neon
create extension if not exists vector;

create table if not exists chunks (
  id      text primary key,
  text    text not null,
  spec    text not null,
  clause  text not null,
  title   text not null,
  embedding vector(1024) not null,
  tsv tsvector generated always as (to_tsvector('english', text)) stored
);

create index if not exists chunks_tsv_idx on chunks using gin (tsv);

-- No HNSW/IVFFlat index: at this corpus size a sequential scan is faster than
-- the index build, and exact search avoids recall loss. Add one past ~50k rows.
```

- [ ] **Step 2: Write the failing test**

```python
# tests/test_db.py
from threegpp_rag.db import to_pgvector

def test_to_pgvector_formats_as_bracketed_csv():
    assert to_pgvector([1.0, 2.5, -3.0]) == "[1.0,2.5,-3.0]"

def test_to_pgvector_empty():
    assert to_pgvector([]) == "[]"
```

- [ ] **Step 3: Run it to make sure it fails**

Run: `uv run pytest tests/test_db.py -v`
Expected: FAIL — `ModuleNotFoundError: threegpp_rag.db`

- [ ] **Step 4: Implement `db.py`**

```python
# src/threegpp_rag/db.py
from typing import Any
import psycopg
from psycopg.rows import dict_row
from threegpp_rag.config import get_settings

def to_pgvector(v: list[float]) -> str:
    return "[" + ",".join(str(x) for x in v) + "]"

def connect() -> psycopg.Connection:
    # Use Neon's pooled endpoint (-pooler host) so serverless invocations
    # do not exhaust connections.
    return psycopg.connect(get_settings().db_url, row_factory=dict_row)

def query(sql: str, params: tuple[Any, ...] = ()) -> list[dict]:
    with connect() as conn, conn.cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchall() if cur.description else []
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `uv run pytest tests/test_db.py -v`
Expected: PASS (2 tests)

- [ ] **Step 6: Implement the ingestion CLI**

Filename → spec mapping is derived, so any `.docx` dropped in `data/raw/` works.

```python
# src/threegpp_rag/ingest/run.py
import re, sys
from pathlib import Path
import psycopg
from threegpp_rag.config import get_settings
from threegpp_rag.db import connect, to_pgvector
from threegpp_rag.ingest.chunk import chunk_sections
from threegpp_rag.ingest.parse import parse_docx
from threegpp_rag.ingest.parse_openapi import parse_openapi
from threegpp_rag.jina import embed

BATCH = 64

def spec_from_filename(path: Path) -> str:
    """'28552-k30.docx' -> 'TS 28.552'"""
    m = re.match(r"(\d{2})(\d{3})", path.stem)
    if not m:
        raise ValueError(f"Cannot derive spec number from {path.name}")
    return f"TS {m.group(1)}.{m.group(2)}"

def main() -> None:
    files = sorted(Path("data/raw").glob("*.docx"))
    if not files:
        sys.exit("No .docx files in data/raw/")

    all_sections = []
    for f in files:
        spec = spec_from_filename(f)
        secs = parse_docx(f, spec)
        print(f"{f.name}: {len(secs)} sections [{spec}]")
        all_sections.extend(secs)

    for f in sorted(Path("data/raw/openapi").glob("*.yaml")):
        secs = parse_openapi(f)
        print(f"{f.name}: {len(secs)} sections")
        all_sections.extend(secs)

    all_chunks = chunk_sections(all_sections)
    print(f"{len(all_sections)} sections -> {len(all_chunks)} chunks")

    print(f"total {len(all_chunks)} chunks; ~{sum(len(c.text) for c in all_chunks)//4} tokens to embed")
    if input("proceed? [y/N] ").strip().lower() != "y":
        sys.exit("aborted")

    with connect() as conn:
        for i in range(0, len(all_chunks), BATCH):
            batch = all_chunks[i:i + BATCH]
            vectors = embed([c.text for c in batch], "passage")
            with conn.cursor() as cur:
                cur.executemany(
                    """insert into chunks (id, text, spec, clause, title, embedding)
                       values (%s, %s, %s, %s, %s, %s)
                       on conflict (id) do update set
                         text = excluded.text, embedding = excluded.embedding""",
                    [(c.id, c.text, c.spec, c.clause, c.title, to_pgvector(v))
                     for c, v in zip(batch, vectors)],
                )
            conn.commit()
            print(f"  upserted {i + len(batch)}/{len(all_chunks)}")

if __name__ == "__main__":
    main()
```

- [ ] **Step 7: Create the Neon database and apply the schema**

1. Create a project at neon.tech, copy the **pooled** connection string (host contains `-pooler`) into `.env` as `DB_URL`.
2. Apply the schema:

```bash
psql "$DB_URL" -f schema.sql
psql "$DB_URL" -c "\d chunks"
```

Expected: table with `embedding vector(1024)` and generated `tsv` column.

- [ ] **Step 8: Run ingestion**

```bash
uv run python -m threegpp_rag.ingest.run
psql "$DB_URL" -c "select spec, count(*) from chunks group by spec;"
```

Expected: a non-zero row count per spec. Note the printed token estimate before confirming — it draws on the shared Jina free-tier budget.

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "feat: neon schema and docx ingestion pipeline"
```

---

### Task 6: Hybrid retrieval with RRF

**Files:**
- Create: `src/threegpp_rag/retrieval.py`
- Test: `tests/test_retrieval.py`

**Interfaces:**
- Consumes: `embed` (Task 2), `query`/`to_pgvector` (Task 5), `Chunk` (Task 1).
- Produces: `retrieve(q: str, top_k: int | None = None) -> list[Chunk]`; `rrf_sql() -> str`.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_retrieval.py
from threegpp_rag.retrieval import rrf_sql, rows_to_chunks

def test_rrf_sql_fuses_both_arms():
    sql = rrf_sql()
    assert "embedding <=>" in sql          # dense arm
    assert "plainto_tsquery" in sql        # sparse arm
    assert "1.0 / (60 +" in sql            # RRF constant k=60
    assert "full outer join" in sql.lower() # keep hits found by either arm

def test_rows_to_chunks_maps_fields():
    rows = [{"id": "a", "text": "t", "spec": "TS 28.552", "clause": "5.1", "title": "KPI"}]
    chunks = rows_to_chunks(rows)
    assert chunks[0].citation == "TS 28.552 §5.1"
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `uv run pytest tests/test_retrieval.py -v`
Expected: FAIL — `ModuleNotFoundError: threegpp_rag.retrieval`

- [ ] **Step 3: Implement `retrieval.py`**

```python
# src/threegpp_rag/retrieval.py
from threegpp_rag.config import get_settings
from threegpp_rag.db import query, to_pgvector
from threegpp_rag.jina import embed
from threegpp_rag.types import Chunk

RRF_K = 60

def rrf_sql() -> str:
    """Dense and sparse arms fused by Reciprocal Rank Fusion.

    RRF combines rankings rather than raw scores, so cosine distance and
    ts_rank_cd need no calibration against each other. A full outer join
    keeps documents that only one arm found — the whole point of hybrid.
    """
    return f"""
    with dense as (
      select id, row_number() over (order by embedding <=> %s::vector) as rank
      from chunks
      order by embedding <=> %s::vector
      limit %s
    ),
    sparse as (
      select id, row_number() over (
        order by ts_rank_cd(tsv, plainto_tsquery('english', %s)) desc
      ) as rank
      from chunks
      where tsv @@ plainto_tsquery('english', %s)
      limit %s
    )
    select c.id, c.text, c.spec, c.clause, c.title,
           coalesce(1.0 / ({RRF_K} + dense.rank), 0.0)
         + coalesce(1.0 / ({RRF_K} + sparse.rank), 0.0) as rrf
    from dense
    full outer join sparse on dense.id = sparse.id
    join chunks c on c.id = coalesce(dense.id, sparse.id)
    order by rrf desc
    limit %s
    """

def rows_to_chunks(rows: list[dict]) -> list[Chunk]:
    return [Chunk(id=r["id"], text=r["text"], spec=r["spec"],
                  clause=r["clause"], title=r["title"]) for r in rows]

def retrieve(q: str, top_k: int | None = None) -> list[Chunk]:
    k = top_k or get_settings().top_k
    vec = to_pgvector(embed([q], "query")[0])
    pool = k * 3   # over-fetch per arm so fusion has candidates to work with
    rows = query(rrf_sql(), (vec, vec, pool, q, q, pool, k))
    return rows_to_chunks(rows)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run pytest tests/test_retrieval.py -v`
Expected: PASS (2 tests)

- [ ] **Step 5: Verify against the live database**

```bash
uv run python -c "
from threegpp_rag.retrieval import retrieve
for c in retrieve('What is the alarm notification for a failed cell?'):
    print(c.citation, '|', c.title[:60])
"
```

Expected: results from `TS 28.111`, clauses about alarm notifications. If results look unrelated, check that ingestion actually populated `tsv`.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: hybrid pgvector + tsvector retrieval with RRF"
```

---

### Task 7: CRAG decompose-recompose and action trigger

Ports of `src/lib/crag/decompose.ts` and `action-trigger.ts`. Both are pure functions — no I/O, so they test fast and exactly.

**Files:**
- Create: `src/threegpp_rag/crag/decompose.py`, `src/threegpp_rag/crag/action.py`
- Test: `tests/test_crag_units.py`

**Interfaces:**
- Produces: `split_into_strips(text) -> list[str]`; `recompose(query, text, scorer, keep_threshold) -> str`; `decide_action(scores, upper, lower) -> CragAction`.
- `scorer` is any `Callable[[str, list[str]], list[float]]` — `jina.rerank` in production, a stub in tests.

- [ ] **Step 1: Write the failing test**

The abbreviation and decimal masking matters: 3GPP text is full of `TS 28.552` and `1.5 dB`, which naive sentence splitting shreds.

```python
# tests/test_crag_units.py
from threegpp_rag.crag.action import decide_action
from threegpp_rag.crag.decompose import recompose, split_into_strips

def test_decide_action_thresholds():
    assert decide_action([0.9, 0.2], upper=0.55, lower=0.30) == "correct"
    assert decide_action([0.40], upper=0.55, lower=0.30) == "ambiguous"
    assert decide_action([0.10], upper=0.55, lower=0.30) == "incorrect"

def test_decide_action_empty_scores_is_incorrect():
    assert decide_action([], upper=0.55, lower=0.30) == "incorrect"

def test_decide_action_uses_max_not_mean():
    # one strong hit is enough, even among weak ones
    assert decide_action([0.9, 0.01, 0.01], upper=0.55, lower=0.30) == "correct"

def test_split_preserves_decimals_and_spec_numbers():
    strips = split_into_strips("See TS 28.552 clause 5.1. The value is 1.5 dB. Done.")
    assert any("28.552" in s for s in strips)
    assert any("1.5 dB" in s for s in strips)
    assert len(strips) == 3

def test_split_keeps_table_rows_whole():
    strips = split_into_strips("| alarmId | Identifies the alarm. |")
    assert strips == ["| alarmId | Identifies the alarm. |"]

def test_recompose_drops_low_scoring_strips():
    def scorer(query, docs):
        return [0.9 if "alarm" in d else 0.05 for d in docs]
    out = recompose("alarms", "An alarm was raised. The sky is blue.", scorer, 0.25)
    assert "alarm was raised" in out
    assert "sky is blue" not in out

def test_recompose_empty_text_returns_empty():
    assert recompose("q", "", lambda q, d: [], 0.25) == ""
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `uv run pytest tests/test_crag_units.py -v`
Expected: FAIL — `ModuleNotFoundError: threegpp_rag.crag.action`

- [ ] **Step 3: Implement `action.py`**

```python
# src/threegpp_rag/crag/action.py
from threegpp_rag.types import CragAction

def decide_action(scores: list[float], upper: float, lower: float) -> CragAction:
    """Route on the single best score.

    Max, not mean: one strongly relevant chunk is sufficient to answer, and
    averaging lets a pile of irrelevant chunks veto a correct retrieval.
    """
    top = max(scores) if scores else 0.0
    if top >= upper:
        return "correct"
    if top < lower:
        return "incorrect"
    return "ambiguous"
```

- [ ] **Step 4: Implement `decompose.py`**

```python
# src/threegpp_rag/crag/decompose.py
import re
from typing import Callable

Scorer = Callable[[str, list[str]], list[float]]

_DECIMAL = re.compile(r"(\d)\.(\d)")
_ABBREVS = ["e.g.", "i.e.", "etc.", "cf.", "vs.", "No.", "Fig.", "Ref."]
_SENTENCE = re.compile(r"[^.!?]+[.!?]+|[^.!?]+$")

def split_into_strips(text: str) -> list[str]:
    """Split into sentence-level strips.

    Decimals and abbreviations are masked first: 3GPP prose is dense with
    'TS 28.552' and '1.5 dB', which a naive split on '.' would shred.
    Table rows are yielded whole — a half row is meaningless.
    """
    out: list[str] = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        if line.startswith("|"):
            out.append(line)
            continue
        masked = _DECIMAL.sub(r"\1__DEC__\2", line)
        for a in _ABBREVS:
            masked = masked.replace(a, a.replace(".", "__ABBR__"))
        for frag in _SENTENCE.findall(masked):
            s = frag.strip().replace("__DEC__", ".").replace("__ABBR__", ".")
            if s:
                out.append(s)
    return out

def recompose(query: str, text: str, scorer: Scorer, keep_threshold: float) -> str:
    """Keep only strips scoring above the threshold.

    This is CRAG's knowledge refinement: it shrinks the context the generator
    can drift into, without discarding the chunk wholesale.
    """
    strips = split_into_strips(text)
    if not strips:
        return ""
    scores = scorer(query, strips)
    return " ".join(s for s, sc in zip(strips, scores) if sc >= keep_threshold)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `uv run pytest tests/test_crag_units.py -v`
Expected: PASS (7 tests)

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: CRAG action trigger and decompose-recompose"
```

---

### Task 8: LangGraph state machine

**Files:**
- Create: `src/threegpp_rag/crag/graph.py`
- Test: `tests/test_graph.py`

**Interfaces:**
- Consumes: `decide_action`, `recompose` (Task 7), `retrieve` (Task 6), `rerank` (Task 2).
- Produces: `CragState` TypedDict; `build_graph(deps: CragDeps)`; `CragDeps` dataclass with `retriever`, `scorer`, `rewriter`, `upper`, `lower`, `keep`, `on_event`; `run_crag(question, deps) -> CragState`.

State keys: `question`, `search_query`, `chunks`, `scores`, `action`, `context`, `retries`, `refused`, `trace`.

- [ ] **Step 1: Write the failing test**

Dependencies are injected, so the whole graph tests with zero network calls.

```python
# tests/test_graph.py
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
    assert calls["n"] == 2          # original + exactly one retry
    assert state["retries"] == 1
    assert state["refused"] is True # still ambiguous after retry -> refuse

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
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `uv run pytest tests/test_graph.py -v`
Expected: FAIL — `ModuleNotFoundError: threegpp_rag.crag.graph`

- [ ] **Step 3: Implement `graph.py`**

```python
# src/threegpp_rag/crag/graph.py
from dataclasses import dataclass, field
from typing import Callable, TypedDict
from langgraph.graph import END, START, StateGraph
from threegpp_rag.config import get_settings
from threegpp_rag.crag.action import decide_action
from threegpp_rag.crag.decompose import recompose
from threegpp_rag.types import Chunk, CragAction, TraceEvent

MAX_RETRIES = 1   # bounded so the whole loop fits Vercel's 60s function limit

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
        """Keep only the relevant sentences from each retrieved chunk."""
        parts = []
        for chunk, score in zip(state["chunks"], state["scores"]):
            if score < deps.lower:
                continue
            kept = recompose(state["question"], chunk.text, deps.scorer, deps.keep)
            if kept:
                parts.append(f"[{chunk.citation}] {kept}")
        context = "\n\n".join(parts)
        emit(state, "refine", kept_chunks=len(parts), context_chars=len(context))
        # Refinement can filter everything out; that is itself a refusal signal.
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
        # ambiguous: one retry, then give up rather than answer on weak evidence
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
    g.add_edge("rewrite", "retrieve")   # the cycle: retry retrieval once
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run pytest tests/test_graph.py -v`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: LangGraph CRAG state machine with refuse branch"
```

---

### Task 9: Generator — grounded answers with citations

**Files:**
- Create: `src/threegpp_rag/generate.py`
- Test: `tests/test_generate.py`

**Interfaces:**
- Consumes: `get_settings()` (Task 1).
- Produces: `REFUSAL` constant; `build_prompt(question, context) -> str`; `answer(question, context) -> str`; `rewrite_query(q) -> str`; `check_model() -> bool`.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_generate.py
from threegpp_rag.generate import REFUSAL, answer, build_prompt

def test_prompt_states_the_grounding_rule_and_citation_format():
    p = build_prompt("What is an alarm?", "[TS 28.111 §4.1] An alarm is a notification.")
    assert "ONLY" in p
    assert "TS 28.111 §4.1" in p
    assert REFUSAL in p            # model is told the exact refusal string
    assert "What is an alarm?" in p

def test_empty_context_refuses_without_calling_the_model():
    # No API key needed: empty context short-circuits before any network call.
    assert answer("anything", "") == REFUSAL

def test_whitespace_only_context_refuses():
    assert answer("anything", "   \n  ") == REFUSAL
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `uv run pytest tests/test_generate.py -v`
Expected: FAIL — `ModuleNotFoundError: threegpp_rag.generate`

- [ ] **Step 3: Implement `generate.py`**

```python
# src/threegpp_rag/generate.py
from google import genai
from threegpp_rag.config import get_settings

REFUSAL = "Not found in the provided 3GPP specifications."

PROMPT = """You are a 3GPP standards assistant for telecom network operations.

Answer the QUESTION using ONLY the CONTEXT below. The context is extracted from
3GPP specification documents.

Rules:
1. Use ONLY facts stated in the CONTEXT. Do not infer, extrapolate, or use prior
   knowledge of 3GPP or telecoms.
2. Cite the source for every claim, using the bracketed tag shown in the context,
   for example: TS 28.111 §4.1
3. If the CONTEXT does not contain the answer, reply with exactly:
   {refusal}
4. Do not apologise or explain what you cannot do. Answer, or give the exact
   refusal sentence.

CONTEXT:
{context}

QUESTION: {question}

ANSWER:"""

def _client() -> genai.Client:
    return genai.Client(api_key=get_settings().gemini_api_key)

def build_prompt(question: str, context: str) -> str:
    return PROMPT.format(refusal=REFUSAL, context=context, question=question)

def answer(question: str, context: str) -> str:
    # Empty context means retrieval or refinement rejected everything; there is
    # nothing to ground an answer in, so refuse without spending a model call.
    if not context.strip():
        return REFUSAL
    resp = _client().models.generate_content(
        model=get_settings().gemini_model,
        contents=build_prompt(question, context),
    )
    return (resp.text or REFUSAL).strip()

def rewrite_query(q: str) -> str:
    """Rewrite into keyword form for a second retrieval pass."""
    resp = _client().models.generate_content(
        model=get_settings().gemini_model,
        contents=(
            "Rewrite this question as a short keyword search query for 3GPP "
            "specification documents. Use technical terms likely to appear "
            "verbatim in the specs. Return ONLY the query.\n\n"
            f"Question: {q}"
        ),
    )
    return (resp.text or q).strip()

def check_model() -> bool:
    """Verify GEMINI_MODEL exists — fail loudly at startup, not mid-demo."""
    want = get_settings().gemini_model
    names = [m.name.split("/")[-1] for m in _client().models.list()]
    return want in names or want.split("/")[-1] in names
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run pytest tests/test_generate.py -v`
Expected: PASS (3 tests)

- [ ] **Step 5: Verify the model name is real**

```bash
uv run python -c "
from threegpp_rag.generate import check_model
from threegpp_rag.config import get_settings
print(get_settings().gemini_model, '->', check_model())
"
```

Expected: `True`. **If `False`, fix `GEMINI_MODEL` in `.env` now** — this is the check that stops a wrong model name surfacing during the demo.

- [ ] **Step 6: End-to-end smoke test**

```bash
uv run python -c "
from threegpp_rag.crag.graph import deps_from_env, run_crag
from threegpp_rag.generate import answer
for q in ['What is an alarm notification?', 'What is the capital of France?']:
    s = run_crag(q, deps_from_env())
    print(f'--- {q}\n    action={s[\"action\"]} refused={s[\"refused\"]}')
    print('   ', answer(q, s['context'])[:200])
"
```

Expected: the first answers with citations; the second returns the refusal.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: grounded generator with citations and refusal"
```

---

### Task 10: FastAPI backend with trace streaming

**Files:**
- Create: `src/threegpp_rag/app.py`, `api/index.py`, `vercel.json`, `Dockerfile`
- Test: `tests/test_app.py`

**Interfaces:**
- Consumes: `run_crag`, `deps_from_env` (Task 8), `answer`, `check_model` (Task 9).
- Produces: `app` (FastAPI); `GET /api/health`; `POST /api/chat` returning `{answer, action, refused, citations, trace}`.

Returning the full trace in one JSON response rather than SSE keeps the frontend a plain `fetch` and avoids streaming complications on Vercel. The inspector renders the trace after the answer arrives.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_app.py
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
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `uv run pytest tests/test_app.py -v`
Expected: FAIL — `ModuleNotFoundError: threegpp_rag.app`

- [ ] **Step 3: Implement `app.py`**

```python
# src/threegpp_rag/app.py
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
    except Exception as e:                      # noqa: BLE001
        chunks, db_ok = 0, False
        print(f"health: db error {e}")
    try:
        model_ok = check_model()
    except Exception as e:                      # noqa: BLE001
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
```

- [ ] **Step 4: Write the Vercel entrypoint and config**

```python
# api/index.py
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))
from threegpp_rag.app import app  # noqa: E402

# Vercel's Python runtime discovers the ASGI callable named `app`.
```

```json
{
  "buildCommand": "cd frontend && npm install && npm run build",
  "outputDirectory": "frontend/dist",
  "functions": { "api/index.py": { "maxDuration": 60 } },
  "rewrites": [{ "source": "/api/(.*)", "destination": "/api/index" }]
}
```

- [ ] **Step 5: Write the Dockerfile**

```dockerfile
# Not used by Vercel. Present so the service can run on Kubernetes/OpenShift.
FROM python:3.13-slim
WORKDIR /app
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev
COPY src/ ./src/
ENV PYTHONPATH=/app/src
EXPOSE 8000
CMD ["uv", "run", "uvicorn", "threegpp_rag.app:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `uv run pytest tests/test_app.py -v`
Expected: PASS (4 tests)

- [ ] **Step 7: Verify the server runs**

```bash
uv run uvicorn threegpp_rag.app:app --reload --port 8000 &
sleep 3
curl -s localhost:8000/api/health
curl -s -X POST localhost:8000/api/chat -H 'content-type: application/json' \
  -d '{"question":"What is an alarm notification?"}' | head -c 500
kill %1
```

Expected: health shows `model_ok: true` and a non-zero chunk count; chat returns an answer with citations.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat: FastAPI backend, vercel config, dockerfile"
```

---

### Task 11: React frontend with inspector panel

The inspector is the demo's most persuasive element: it shows the grading and the branch decision, turning "trust me, it does not hallucinate" into something visible.

**Files:**
- Create: `frontend/` (Vite scaffold), `frontend/src/App.jsx`, `frontend/src/Inspector.jsx`, `frontend/src/index.css`
- Modify: `frontend/vite.config.js`

**Interfaces:**
- Consumes: `POST /api/chat` → `{answer, action, refused, citations, trace}` (Task 10).

- [ ] **Step 1: Scaffold**

```bash
cd frontend
npm create vite@latest . -- --template react
npm install
```

- [ ] **Step 2: Configure the dev proxy**

```javascript
// frontend/vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:8000' } },
})
```

- [ ] **Step 3: Write `Inspector.jsx`**

```jsx
// frontend/src/Inspector.jsx
const ACTION_COLOR = {
  correct: '#16a34a',
  ambiguous: '#d97706',
  incorrect: '#dc2626',
}

export default function Inspector({ action, trace }) {
  if (!trace?.length) return null
  const evaluate = trace.find((e) => e.step === 'evaluate')
  const decision = trace.find((e) => e.step === 'action')

  return (
    <aside className="inspector">
      <h2>Under the hood</h2>

      <div className="badge" style={{ background: ACTION_COLOR[action] }}>
        {action}
      </div>

      {decision && (
        <p className="thresholds">
          top score <strong>{decision.data.top_score}</strong>
          {' '}(refuse &lt; {decision.data.lower} &le; retry &lt; {decision.data.upper} &le; answer)
        </p>
      )}

      {evaluate && (
        <>
          <h3>Retrieved chunks graded</h3>
          <ul className="scores">
            {evaluate.data.scored.map((s) => (
              <li key={s.citation}>
                <span className="bar" style={{ width: `${s.score * 100}%` }} />
                <code>{s.citation}</code>
                <span className="num">{s.score.toFixed(3)}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <h3>Pipeline</h3>
      <ol className="steps">
        {trace.map((e, i) => (
          <li key={i}>
            <strong>{e.step}</strong>
            {e.step === 'rewrite' && <em> → "{e.data.rewritten}"</em>}
            {e.step === 'refine' && <em> → kept {e.data.kept_chunks} chunks</em>}
            {e.step === 'refuse' && <em> → {e.data.reason}</em>}
          </li>
        ))}
      </ol>
    </aside>
  )
}
```

- [ ] **Step 4: Write `App.jsx`**

```jsx
// frontend/src/App.jsx
import { useState } from 'react'
import Inspector from './Inspector'
import './index.css'

const DEMOS = [
  'What is an alarm notification?',
  'Which measurements are defined for RRC connection establishment?',
  'What is the capital of France?',
]

export default function App() {
  const [question, setQuestion] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function ask(q) {
    if (!q.trim()) return
    setLoading(true); setError(null); setResult(null)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: q }),
      })
      if (!res.ok) throw new Error(`Request failed (${res.status})`)
      setResult(await res.json())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="layout">
      <main>
        <h1>3GPP Standards Assistant</h1>
        <p className="sub">
          Answers grounded in 3GPP specs. Refuses when the specs do not cover the question.
        </p>

        <form onSubmit={(e) => { e.preventDefault(); ask(question) }}>
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask about alarms, KPIs, or management services…"
            aria-label="Question"
          />
          <button disabled={loading || !question.trim()}>
            {loading ? 'Thinking…' : 'Ask'}
          </button>
        </form>

        <div className="demos">
          {DEMOS.map((d) => (
            <button key={d} className="chip" onClick={() => { setQuestion(d); ask(d) }}>
              {d}
            </button>
          ))}
        </div>

        {error && <p className="error">{error}</p>}

        {result && (
          <article className={result.refused ? 'answer refused' : 'answer'}>
            <p>{result.answer}</p>
            {result.citations.length > 0 && (
              <footer>
                Sources: {result.citations.map((c) => <code key={c}>{c}</code>)}
              </footer>
            )}
          </article>
        )}
      </main>

      {result && <Inspector action={result.action} trace={result.trace} />}
    </div>
  )
}
```

- [ ] **Step 5: Write `index.css`**

```css
/* frontend/src/index.css */
:root { color-scheme: light; font-family: ui-sans-serif, system-ui, sans-serif; }
body { margin: 0; background: #f8fafc; color: #0f172a; }
.layout { display: grid; grid-template-columns: 1fr 380px; gap: 24px; max-width: 1200px;
          margin: 0 auto; padding: 32px 24px; align-items: start; }
@media (max-width: 900px) { .layout { grid-template-columns: 1fr; } }
h1 { margin: 0 0 4px; font-size: 26px; }
.sub { margin: 0 0 20px; color: #64748b; }
form { display: flex; gap: 8px; }
input { flex: 1; padding: 11px 13px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 15px; }
button { padding: 11px 18px; border: 0; border-radius: 8px; background: #0f172a;
         color: #fff; font-size: 15px; cursor: pointer; }
button:disabled { opacity: .5; cursor: not-allowed; }
.demos { display: flex; flex-wrap: wrap; gap: 8px; margin: 14px 0; }
.chip { background: #e2e8f0; color: #0f172a; font-size: 13px; padding: 6px 11px; }
.answer { background: #fff; border: 1px solid #e2e8f0; border-left: 4px solid #16a34a;
          border-radius: 8px; padding: 16px 18px; line-height: 1.6; }
.answer.refused { border-left-color: #dc2626; }
.answer footer { margin-top: 12px; font-size: 13px; color: #64748b; }
.answer code, .inspector code { background: #f1f5f9; padding: 2px 6px;
                                border-radius: 4px; margin-right: 6px; font-size: 12px; }
.error { color: #dc2626; }
.inspector { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px;
             padding: 16px 18px; font-size: 14px; position: sticky; top: 24px; }
.inspector h2 { margin: 0 0 12px; font-size: 15px; text-transform: uppercase;
                letter-spacing: .06em; color: #64748b; }
.inspector h3 { font-size: 13px; margin: 18px 0 8px; color: #64748b; }
.badge { display: inline-block; color: #fff; padding: 4px 12px; border-radius: 999px;
         font-size: 12px; font-weight: 600; text-transform: uppercase; }
.thresholds { color: #64748b; font-size: 12px; margin: 10px 0 0; }
.scores { list-style: none; padding: 0; margin: 0; }
.scores li { position: relative; padding: 6px 0; border-bottom: 1px solid #f1f5f9;
             display: flex; align-items: center; gap: 8px; }
.bar { position: absolute; left: 0; top: 0; bottom: 0; background: #dbeafe; z-index: 0; }
.scores code, .scores .num { position: relative; z-index: 1; }
.num { margin-left: auto; color: #64748b; font-variant-numeric: tabular-nums; }
.steps { margin: 0; padding-left: 18px; color: #334155; line-height: 1.8; }
.steps em { color: #64748b; }
```

- [ ] **Step 6: Verify it runs end to end**

```bash
# terminal 1
uv run uvicorn threegpp_rag.app:app --port 8000
# terminal 2
cd frontend && npm run dev
```

Open `http://localhost:5173`. Click all three demo chips. Expected: the first two answer with citations and a green `correct` badge; "capital of France" shows the refusal and a red `incorrect` badge with graded scores visible.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: react frontend with CRAG inspector panel"
```

---

### Task 12: Evaluation harness

**Files:**
- Create: `eval/data/qa.jsonl`, `eval/run_eval.py`, `eval/rag_vs_crag.py`
- Test: `tests/test_eval.py`

**Interfaces:**
- Consumes: `run_crag`, `deps_from_env` (Task 8), `answer`, `REFUSAL` (Task 9), `retrieve` (Task 6).
- Produces: `judge(question, expected, actual) -> bool`; `score_row(row, result) -> dict`; CLI reports.

- [ ] **Step 1: Write the golden set**

30 rows. `expected: "REFUSE"` marks out-of-scope questions. Write 20 answerable rows against the ingested specs, plus these 10 refusals — chosen to be *adjacent* to the corpus, so refusing them is genuinely hard.

```jsonl
{"query":"What is the capital of France?","expected":"REFUSE"}
{"query":"How do I configure a Cisco router interface?","expected":"REFUSE"}
{"query":"What is Mavenir's quarterly revenue?","expected":"REFUSE"}
{"query":"What is the pricing model for 5G network slices?","expected":"REFUSE"}
{"query":"Which vendor has the best RAN equipment?","expected":"REFUSE"}
{"query":"How do I write a Kubernetes operator in Go?","expected":"REFUSE"}
{"query":"What will 6G alarm management look like?","expected":"REFUSE"}
{"query":"What is the recommended staffing for a NOC team?","expected":"REFUSE"}
{"query":"How do I reset my password on the OSS portal?","expected":"REFUSE"}
{"query":"What is the SLA penalty for exceeding alarm response time?","expected":"REFUSE"}
```

Derive the 20 answerable rows from real clauses:

```bash
psql "$DB_URL" -c "select spec, clause, title from chunks order by random() limit 40;"
```

Format: `{"query":"...","expected":"<key phrase that must appear>","citation":"TS 28.111 §4.1"}`

- [ ] **Step 2: Write the failing test**

```python
# tests/test_eval.py
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
```

- [ ] **Step 3: Run it to make sure it fails**

Run: `uv run pytest tests/test_eval.py -v`
Expected: FAIL — `ModuleNotFoundError: run_eval`

- [ ] **Step 4: Implement `eval/run_eval.py`**

```python
# eval/run_eval.py
import json, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))
from threegpp_rag.crag.graph import deps_from_env, run_crag       # noqa: E402
from threegpp_rag.generate import REFUSAL, answer                 # noqa: E402

def score_row(row: dict, result: dict) -> dict:
    refused = result["refused"] or REFUSAL in result["answer"]
    want_refusal = row["expected"] == "REFUSE"
    if want_refusal:
        return {"correct": refused, "hallucinated": not refused,
                "false_refusal": False, "citation_ok": True}
    hit = row["expected"].lower() in result["answer"].lower()
    citation_ok = ("citation" not in row) or (row["citation"] in result["answer"]) \
        or (row["citation"] in result.get("citations", []))
    return {"correct": hit and not refused, "hallucinated": False,
            "false_refusal": refused, "citation_ok": citation_ok}

def main() -> None:
    rows = [json.loads(l) for l in Path("eval/data/qa.jsonl").read_text().splitlines() if l.strip()]
    results = []
    for row in rows:
        state = run_crag(row["query"], deps_from_env())
        text = answer(row["query"], state["context"])
        result = {"answer": text, "refused": state["refused"],
                  "citations": [c.citation for c in state.get("chunks", [])]}
        s = score_row(row, result)
        results.append({**row, **s, "action": state["action"]})
        mark = "PASS" if s["correct"] else "FAIL"
        print(f"[{mark}] {row['query'][:60]:60s} action={state['action']}")

    in_scope = [r for r in results if r["expected"] != "REFUSE"]
    out_scope = [r for r in results if r["expected"] == "REFUSE"]
    pct = lambda n, d: f"{100 * n / d:.0f}%" if d else "n/a"

    print("\n" + "=" * 58)
    print(f"Answer accuracy (in-scope)   {pct(sum(r['correct'] for r in in_scope), len(in_scope))}")
    print(f"Citation validity            {pct(sum(r['citation_ok'] for r in in_scope), len(in_scope))}")
    print(f"Refusal rate (out-of-scope)  {pct(sum(r['correct'] for r in out_scope), len(out_scope))}")
    print(f"False-refusal rate           {pct(sum(r['false_refusal'] for r in in_scope), len(in_scope))}")
    print(f"Hallucination rate           {pct(sum(r['hallucinated'] for r in out_scope), len(out_scope))}")
    print("=" * 58)
    Path("eval/results.json").write_text(json.dumps(results, indent=2))

if __name__ == "__main__":
    main()
```

- [ ] **Step 5: Implement `eval/rag_vs_crag.py`**

Port of `eval/rag-vs-crag.ts`. Vanilla RAG uses the same retrieval but skips grading, refinement, and the refusal gate — isolating the contribution of the correction loop.

```python
# eval/rag_vs_crag.py
import json, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))
from threegpp_rag.crag.graph import deps_from_env, run_crag       # noqa: E402
from threegpp_rag.generate import REFUSAL, answer                 # noqa: E402
from threegpp_rag.retrieval import retrieve                       # noqa: E402

def main() -> None:
    rows = [json.loads(l) for l in Path("eval/data/qa.jsonl").read_text().splitlines() if l.strip()]
    crag_hits = rag_hits = 0

    for row in rows:
        want_refusal = row["expected"] == "REFUSE"

        state = run_crag(row["query"], deps_from_env())
        crag_ans = answer(row["query"], state["context"])

        # Vanilla RAG: same retrieval, no grading, no gate — it always answers.
        plain_ctx = "\n\n".join(f"[{c.citation}] {c.text}" for c in retrieve(row["query"]))
        rag_ans = answer(row["query"], plain_ctx)

        crag_ok = state["refused"] if want_refusal else row["expected"].lower() in crag_ans.lower()
        rag_ok = (REFUSAL in rag_ans) if want_refusal else row["expected"].lower() in rag_ans.lower()
        crag_hits += crag_ok
        rag_hits += rag_ok
        print(f"Q: {row['query'][:55]}\n  CRAG[{state['action']}] {'ok' if crag_ok else 'MISS'}"
              f" | RAG {'ok' if rag_ok else 'MISS'}")

    n = len(rows)
    print(f"\nCRAG {crag_hits}/{n}   vanilla RAG {rag_hits}/{n}")

if __name__ == "__main__":
    main()
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `uv run pytest tests/test_eval.py -v`
Expected: PASS (4 tests)

- [ ] **Step 7: Run the evaluation and calibrate thresholds**

```bash
uv run python eval/run_eval.py
```

If refusal rate is below target, raise `CRAG_LOWER`. If false-refusal rate is above 10%, lower it. Re-run after each change. **Record the final thresholds and the reasoning** — "I calibrated these on the eval set" is a much stronger answer than a round number.

```bash
uv run python eval/rag_vs_crag.py
```

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat: evaluation harness and RAG vs CRAG study"
```

---

### Task 13: Deployment and README

**Files:**
- Create: `README.md`
- Modify: `vercel.json` if the build needs adjusting

- [ ] **Step 1: Deploy**

```bash
npm i -g vercel
vercel link
vercel env add JINA_API_KEY production
vercel env add GEMINI_API_KEY production
vercel env add GEMINI_MODEL production
vercel env add DB_URL production        # the -pooler host
vercel env add CRAG_UPPER production
vercel env add CRAG_LOWER production
vercel --prod
```

- [ ] **Step 2: Verify production**

```bash
curl -s https://<deployment>.vercel.app/api/health
curl -s -X POST https://<deployment>.vercel.app/api/chat \
  -H 'content-type: application/json' \
  -d '{"question":"What is an alarm notification?"}' | head -c 400
```

Expected: health reports `model_ok: true` and the chunk count; chat answers with citations inside the 60s limit. If it times out, reduce `CRAG_TOP_K`, since refinement scores every chunk's sentences.

- [ ] **Step 3: Write the README**

Include, in this order:
1. One-line description and the live URL.
2. Architecture diagram (the ASCII flow from the spec).
3. **Evaluation results table with real numbers** from Task 12 — the highest-value section.
4. The seven hallucination controls, in a table.
5. Why the `incorrect` branch refuses rather than falling back to web search.
6. Corpus table with spec numbers and versions.
7. Local setup: `uv sync`, `psql -f schema.sql`, ingest, run.
8. Honest limitations: Tier 1 corpus only, single retry, no conversation memory, no multi-agent orchestration.

- [ ] **Step 4: Record a demo**

Capture a GIF of three queries in this order: an alarm question (`correct`), a KPI table question (`correct`), then "capital of France" (`incorrect`, refused). Show the inspector panel throughout. **The refusal is the money shot** — it demonstrates hallucination control more convincingly than any correct answer.

- [ ] **Step 5: Final check**

```bash
uv run pytest -v          # all tests green
git status                # nothing uncommitted, .env not tracked
```

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "docs: readme with architecture and eval results"
git log --oneline
```

---

## Interview preparation

Have answers ready for these — each maps to a decision in this plan:

- **Why hybrid retrieval?** 3GPP text is dense with exact identifiers (`NRCellCU`, `RRC.ConnEstabAtt`). Dense retrieval misses exact tokens; BM25 misses paraphrase. RRF fuses ranks, so the two scoring scales need no calibration.
- **Why no ANN index?** Under ~50k rows, exact scan is faster than the index build and loses no recall. Adding HNSW is a one-line change when the corpus grows.
- **Why refuse instead of web fallback?** In a standards-compliance context, a plausible non-normative answer is worse than no answer. My earlier SEC version *did* use web fallback, because there the failure mode was different.
- **How do you know it doesn't hallucinate?** Point at the eval table — and specifically at the false-refusal rate, which shows the system is not simply refusing everything.
- **Why max score, not mean?** One strongly relevant chunk is enough to answer; averaging lets irrelevant chunks veto a correct retrieval.
- **What would you build next?** A second agent for alarm correlation across time windows, and RAGAS-based faithfulness scoring in CI.

---

## Self-review notes

- **Spec coverage:** every §4 pipeline stage maps to Tasks 6–9; §5 refusal policy to Task 8; §6 controls 1–7 to Tasks 6, 8, 7, 9, 11; §7 evaluation to Task 12; §8 deployment to Tasks 10 and 13. Corpus §3 is user-supplied per instruction, consumed by Task 5.
- **Deliberate omission:** the evaluator benchmark (LLM-judge vs cross-encoder) from the prior project is dropped. It doubles the Jina token spend and the golden-set eval already demonstrates evaluation rigour. Add it only if Day 4 runs ahead.
- **Type consistency:** `Chunk(id, text, spec, clause, title)` and `.citation` are used identically in Tasks 1, 3–6, 8, 10, 12. `scorer` has signature `(query, docs) -> list[float]` in Tasks 2, 7, 8. `TraceEvent(step, data)` is consistent in Tasks 1, 8, 10, 11.
