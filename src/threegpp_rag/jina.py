"""
Embedding and reranking via Cohere API.
Named jina.py for interface compatibility with the plan; backend is Cohere.
Cohere embed-multilingual-v3.0 produces 1024-dim vectors matching schema.sql.
"""
import time
from typing import Literal
import httpx
from threegpp_rag.config import get_settings

EMBED_URL = "https://api.cohere.ai/v1/embed"
RERANK_URL = "https://api.cohere.ai/v1/rerank"
EMBED_MODEL = "embed-multilingual-v3.0"
RERANK_MODEL = "rerank-multilingual-v3.0"
DIMENSIONS = 1024
MAX_ATTEMPTS = 6

def _post(url: str, payload: dict, api_key: str, client: httpx.Client, base_delay: float) -> dict:
    """POST with exponential backoff on 429."""
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
                raise RuntimeError(f"Cohere rate limit: exhausted {MAX_ATTEMPTS} attempts")
            print(f"  cohere 429, retrying in {delay}s (attempt {attempt}/{MAX_ATTEMPTS})")
            time.sleep(delay)
            delay = delay * 2 if delay else 0.0
            continue
        if resp.status_code != 200:
            raise RuntimeError(f"Cohere error {resp.status_code}: {resp.text}")
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
    api_key = api_key or get_settings().cohere_api_key
    owned = client is None
    client = client or httpx.Client()
    try:
        input_type = "search_query" if task == "query" else "search_document"
        data = _post(EMBED_URL, {
            "model": EMBED_MODEL,
            "texts": texts,
            "input_type": input_type,
            "embedding_types": ["float"],
        }, api_key, client, base_delay)
    finally:
        if owned:
            client.close()
    # Cohere returns embeddings in the same order as input texts.
    return data["embeddings"]["float"]

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
    api_key = api_key or get_settings().cohere_api_key
    owned = client is None
    client = client or httpx.Client()
    try:
        data = _post(RERANK_URL, {
            "model": RERANK_MODEL,
            "query": query,
            "documents": docs,
            "top_n": len(docs),
        }, api_key, client, base_delay)
    finally:
        if owned:
            client.close()
    # Cohere sorts by relevance — realign to input order.
    scores = [0.0] * len(docs)
    for r in data["results"]:
        scores[r["index"]] = r["relevance_score"]
    return scores
