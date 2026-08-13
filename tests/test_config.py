import pytest
from threegpp_rag.config import get_settings

def test_settings_read_from_env(monkeypatch):
    monkeypatch.setenv("COHERE_API_KEY", "ck")
    monkeypatch.setenv("GEMINI_API_KEY", "gk")
    monkeypatch.setenv("GEMINI_MODEL", "gemini-x")
    monkeypatch.setenv("DB_URL", "postgres://x")
    get_settings.cache_clear()
    s = get_settings()
    assert s.cohere_api_key == "ck"
    assert s.gemini_model == "gemini-x"
    assert s.upper_threshold == 0.55   # default
    assert s.lower_threshold == 0.30   # default

def test_missing_required_env_raises(monkeypatch):
    monkeypatch.delenv("COHERE_API_KEY", raising=False)
    monkeypatch.setenv("GEMINI_API_KEY", "gk")
    monkeypatch.setenv("DB_URL", "postgres://x")
    get_settings.cache_clear()
    with pytest.raises(RuntimeError, match="COHERE_API_KEY"):
        get_settings()
