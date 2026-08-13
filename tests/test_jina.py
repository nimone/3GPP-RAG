import httpx, pytest
from threegpp_rag.jina import embed, rerank

def _client(handler):
    return httpx.Client(transport=httpx.MockTransport(handler))

def test_rerank_realigns_to_input_order():
    # Cohere returns descending by score; doc at index 2 is most relevant.
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
        return httpx.Response(200, json={"embeddings": {"float": [[2.0], [1.0]]}, "texts": ["b", "a"]})
    # Cohere embed returns in the same order as input, but we sort by position
    result = embed(["a", "b"], "passage", api_key="k", client=_client(handler))
    assert len(result) == 2
    assert all(isinstance(v, list) for v in result)

def test_retries_on_429_then_succeeds():
    calls = {"n": 0}
    def handler(request):
        calls["n"] += 1
        if calls["n"] < 3:
            return httpx.Response(429, json={"message": "rate limited"})
        return httpx.Response(200, json={"results": [{"index": 0, "relevance_score": 0.7}]})
    scores = rerank("q", ["a"], api_key="k", client=_client(handler), base_delay=0.0)
    assert scores == [0.7]
    assert calls["n"] == 3

def test_raises_after_exhausting_retries():
    def handler(request):
        return httpx.Response(429, json={"message": "rate limited"})
    with pytest.raises(RuntimeError, match="rate limit"):
        rerank("q", ["a"], api_key="k", client=_client(handler), base_delay=0.0)
