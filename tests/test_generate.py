from threegpp_rag.generate import REFUSAL, answer, build_prompt

def test_prompt_states_the_grounding_rule_and_citation_format():
    p = build_prompt("What is an alarm?", "[TS 28.111 §4.1] An alarm is a notification.")
    assert "ONLY" in p
    assert "TS 28.111 §4.1" in p
    assert REFUSAL in p
    assert "What is an alarm?" in p

def test_empty_context_refuses_without_calling_the_model():
    assert answer("anything", "") == REFUSAL

def test_whitespace_only_context_refuses():
    assert answer("anything", "   \n  ") == REFUSAL

def test_answer_falls_back_to_fallback_model(monkeypatch):
    from unittest.mock import MagicMock
    from threegpp_rag import generate

    calls = []
    def fake_generate_content(model, contents):
        calls.append(model)
        if model == "gemini-3.5-flash-lite":
            raise RuntimeError("Primary model quota exceeded")
        mock_resp = MagicMock()
        mock_resp.text = "Fallback answer"
        return mock_resp

    mock_client = MagicMock()
    mock_client.models.generate_content = fake_generate_content
    monkeypatch.setattr(generate, "_client", lambda: mock_client)

    result = generate.answer("What is X?", "Some context")
    assert result == "Fallback answer"
    assert calls == ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"]

def test_answer_stream_falls_back_to_fallback_model(monkeypatch):
    from unittest.mock import MagicMock
    from threegpp_rag import generate

    calls = []
    def fake_generate_content_stream(model, contents):
        calls.append(model)
        if model == "gemini-3.5-flash-lite":
            raise RuntimeError("Primary model down")
        chunk = MagicMock()
        chunk.text = "Fallback chunk"
        return [chunk]

    mock_client = MagicMock()
    mock_client.models.generate_content_stream = fake_generate_content_stream
    monkeypatch.setattr(generate, "_client", lambda: mock_client)

    chunks = list(generate.answer_stream("What is X?", "Some context"))
    assert chunks == ["Fallback chunk"]
    assert calls == ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"]

def test_rewrite_query_falls_back_to_fallback_model(monkeypatch):
    from unittest.mock import MagicMock
    from threegpp_rag import generate

    calls = []
    def fake_generate_content(model, contents):
        calls.append(model)
        if model == "gemini-3.5-flash-lite":
            raise RuntimeError("Primary model failed")
        mock_resp = MagicMock()
        mock_resp.text = "rewritten 3gpp query"
        return mock_resp

    mock_client = MagicMock()
    mock_client.models.generate_content = fake_generate_content
    monkeypatch.setattr(generate, "_client", lambda: mock_client)

    result = generate.rewrite_query("original query")
    assert result == "rewritten 3gpp query"
    assert calls == ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"]
