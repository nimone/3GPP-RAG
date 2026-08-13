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
            "top_n": len(docs),
        }, api_key, client, base_delay)
    finally:
        if owned:
            client.close()
    # Jina sorts by relevance — realign to input order.
    scores = [0.0] * len(docs)
    for r in data["results"]:
        scores[r["index"]] = r["relevance_score"]
    return scores
